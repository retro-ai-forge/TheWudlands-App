"""
Every find_one_and_update in the backend must go through
backend.db.find_one_and_update_checked (CLAUDE.md, "Firestore note"): on
Firestore a direct call can hand a document back to callers whose write did
not land. This fails as soon as a direct call is added anywhere in backend/.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).parent.parent / "backend"
# The helper itself is the one place allowed to call the driver's method.
ALLOWED = {("db.py", "find_one_and_update_checked")}
RAW_METHODS = {"find_one_and_update", "find_one_and_replace", "find_one_and_delete"}


def _raw_calls(path: Path) -> list[str]:
    found = []
    tree = ast.parse(path.read_text(), filename=str(path))

    def visit(node, function):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            function = node.name
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in RAW_METHODS
            and (path.name, function) not in ALLOWED
        ):
            found.append(f"{path.relative_to(BACKEND.parent)}:{node.lineno} {node.func.attr}")
        for child in ast.iter_child_nodes(node):
            visit(child, function)

    visit(tree, None)
    return found


def test_backend_never_calls_find_one_and_update_directly():
    raw = [call for path in sorted(BACKEND.rglob("*.py")) for call in _raw_calls(path)]
    assert not raw, (
        "Use backend.db.find_one_and_update_checked instead (CLAUDE.md, Firestore note):\n  "
        + "\n  ".join(raw)
    )
