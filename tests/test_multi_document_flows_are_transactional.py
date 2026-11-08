"""
Every public function that writes to two or more collections must run in
one transaction (@_in_transaction in backend.players, @transactional from
backend.db) - otherwise a lost race or a crash halfway leaves things half
moved: items gone from one place and never arriving in the other, or
duplicated (see backend.db.run_in_transaction).

This reads the source (no database needed) and follows writes through
helper functions. A call to another transactional function counts as one
self-contained write.

Not checked here: backend/adventures.py. Adventures were built without
transactions on purpose - every step is a conditional write, statuses
(starting -> active -> ending -> done) mark half-done work, and
recover_adventures finishes or undoes it - and are covered by their own
parallel race tests in tests/test_adventures.py.
"""

import ast
import re
from pathlib import Path

BACKEND = Path(__file__).parent.parent / "backend"
CHECKED_MODULES = ("players.py", "foraging.py", "condition.py", "legend.py", "soul_slots.py")
DECORATORS = {"_in_transaction", "transactional"}
WRITE_METHODS = {"update_one", "update_many", "insert_one", "insert_many", "delete_one", "delete_many",
                 "replace_one", "bulk_write", "find_one_and_update_checked"}
# Public functions allowed to write several collections outside a transaction, with the reason.
ALLOWED: dict[str, str] = {}


def _functions():
    funcs = {}
    for module in CHECKED_MODULES:
        path = BACKEND / module
        src = path.read_text()
        for node in ast.parse(src).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                funcs[node.name] = (module, node, src)
    return funcs


FUNCS = _functions()


def _is_transactional(node) -> bool:
    return any(ast.unparse(d) in DECORATORS for d in node.decorator_list)


def _call_name(call: ast.Call):
    f = call.func
    return f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", None)


def _local_collections(node, src: str) -> dict:
    """Local variables holding a collection (`coll = _storage_coll(...)`,
    `plays = db.story_plays`) -> what they point at."""
    names = {}
    for sub in ast.walk(node):
        if isinstance(sub, ast.Assign) and len(sub.targets) == 1 and isinstance(sub.targets[0], ast.Name):
            value = ast.unparse(sub.value)
            match = re.fullmatch(r"db\.(\w+)", value)
            if match:
                names[sub.targets[0].id] = match.group(1)
            elif "_storage_coll(" in value:
                names[sub.targets[0].id] = "storage"
    return names


def _write_target(call: ast.Call, src: str, local: dict) -> str:
    # The collection written to: find_one_and_update_checked's first
    # argument, or what `.update_one(...)` etc. is called on.
    if _call_name(call) == "find_one_and_update_checked":
        receiver = call.args[0] if call.args else None
    else:
        receiver = call.func.value if isinstance(call.func, ast.Attribute) else None
    if isinstance(receiver, ast.Name) and receiver.id in local:
        return local[receiver.id]
    segment = ast.unparse(receiver) if receiver is not None else ""
    match = re.search(r"db\.(\w+)|db\[[\"'](\w+)[\"']\]", segment)
    if match:
        return match.group(1) or match.group(2)
    return "storage" if "storage" in segment else f"unknown@{call.lineno}"


def _resolve_targets() -> dict:
    """Function name -> every collection it writes, directly or through the
    helpers it calls (worked out over the whole call graph at once)."""
    direct, calls = {}, {}
    for name, (_module, node, src) in FUNCS.items():
        local = _local_collections(node, src)
        direct[name], calls[name] = set(), set()
        for sub in ast.walk(node):
            if not isinstance(sub, ast.Call):
                continue
            callee = _call_name(sub)
            if callee in WRITE_METHODS:
                direct[name].add(_write_target(sub, src, local))
            elif callee in FUNCS and callee != name:
                if _is_transactional(FUNCS[callee][1]):
                    direct[name].add(f"transaction:{callee}")
                else:
                    calls[name].add(callee)
    total = {name: set(found) for name, found in direct.items()}
    changed = True
    while changed:
        changed = False
        for name in total:
            before = len(total[name])
            for callee in calls[name]:
                total[name] |= total[callee]
            changed |= len(total[name]) != before
    return {name: found - {"active_players"} for name, found in total.items()}


TARGETS = _resolve_targets()


def _targets(name: str) -> set:
    return TARGETS.get(name, set())


def test_every_public_multi_collection_flow_runs_in_a_transaction():
    missing = []
    for name, (module, node, _src) in sorted(FUNCS.items()):
        if name.startswith("_") or not isinstance(node, ast.AsyncFunctionDef) or name in ALLOWED:
            continue
        targets = _targets(name)
        if len(targets) >= 2 and not _is_transactional(node):
            missing.append(f"{module}:{node.lineno} {name} writes {sorted(targets)}")
    assert not missing, (
        "These write several collections outside a transaction - decorate them "
        "(@_in_transaction / @transactional) or list them in ALLOWED with a reason:\n  "
        + "\n  ".join(missing)
    )


def test_the_check_sees_a_flow_that_is_not_in_a_transaction():
    # Guards the guard: an undecorated two-collection flow must be reported.
    src = (
        "async def move(db):\n"
        "    await db.player_vaults.update_one({}, {})\n"
        "    await db.characters.update_one({}, {})\n"
    )
    node = ast.parse(src).body[0]
    FUNCS["move"] = ("probe.py", node, src)
    try:
        assert _resolve_targets()["move"] == {"player_vaults", "characters"}
        assert not _is_transactional(node)
    finally:
        del FUNCS["move"]
