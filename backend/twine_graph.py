"""
SugarCube story parsing shared by the submit validator (backend.auth_routes)
and the adventure runtime (backend.adventures).

Kept in its own module so both can import it without a circular import:
auth_routes imports adventures for its routes, and adventures needs the same
link parser to validate each step a player takes.
"""

from __future__ import annotations

import re as _re

# SugarCube special passages. These carry runtime meaning (UI chrome, startup
# code, per-passage hooks, widget definitions) rather than being navigable story
# nodes, so the structural rules below (needs an ending / needs outgoing links /
# must be reachable) do not apply to them. StoryTitle and StoryData are not in
# this set because the editor folds them into story metadata — they are never
# passages in a saved story.
_RESERVED_PASSAGES = {
    "StoryInit",
    "PassageHeader",
    "PassageFooter",
    "PassageReady",
    "PassageDone",
    "StoryCaption",
    "StoryMenu",
    "StorySubtitle",
    "StoryAuthor",
    "StoryBanner",
    "StoryInterface",
    "StoryShare",
    "StoryDisplayTitle",
}

# How a run ends is the $isEnding value the ending scene sets (the story check
# reads it, story_rules.ending_kind): "success" / "failure" (a name may follow,
# "success:dragon_slain"); the Retreat story ends only in failures, and an
# ending in the Retreat graph is what makes a run a run-away. "lastresort" is
# LastResort's - the engine failed, the run is given back.
# Every dead end of a story carries one; docs/STORY-RULES.md "Endings".
ENDING_EXAMPLE = '<<set $isEnding to "success">>'
LAST_RESORT_ENDING = '<<set $isEnding to "lastresort">>'

# The always-available voluntary-exit scene and the fault-recovery scene. Both
# are required by the submit validator.
RETREAT_PASSAGE = "Retreat"
LAST_RESORT_PASSAGE = "LastResort"

# Test characters for the editor's Test (a JSON list, see docs/STORY-RULES.md):
# not a scene - nothing may lead to it, it needs no ending, and it is removed
# when the story is submitted, so it never reaches a played story.
TEST_CHARACTERS_PASSAGE = "TestCharacters"

# One link macro body, i.e. whatever sits between [[ and ]]. Non-greedy so each
# [[...]] is captured separately; a trailing setter component ([[Text][$x to 1]])
# is stripped in _link_target.
_LINK_RE = _re.compile(r"\[\[(.+?)\]\]")


def _link_target(body: str) -> str:
    """Resolve the destination passage name from a link macro body.

    Handles every SugarCube link form:
        [[Target]]                -> Target
        [[Display|Target]]        -> Target
        [[Display->Target]]       -> Target
        [[Target<-Display]]       -> Target
        [[Display|Target][setter]]-> Target (setter component ignored)
    """
    # Drop a setter component: [[Text|Target][$x to 1]] -> "Text|Target".
    if "][" in body:
        body = body.split("][", 1)[0]
    if "->" in body:
        return body.split("->", 1)[1].strip()
    if "<-" in body:
        return body.split("<-", 1)[0].strip()
    if "|" in body:
        return body.split("|", 1)[1].strip()
    return body.strip()


# The destination of an image-link macro [img[src][passage]] (the second
# bracket group). The passage name is parsed out of it with _link_target.
# Opened like SugarCube opens an image: any case, optional alignment ([<img[).
_IMG_LINK_RE = _re.compile(r"\[[<>]?img\[[^\]]*\]\[([^\]]+?)\]", _re.IGNORECASE)


def _extract_set_value(text: str, name: str):
    """Return the value of `<<set $name to VALUE>>` (or `= VALUE`) from a passage's text.

    Strings (single/double quoted) come back unquoted; integers and floats are
    coerced to numbers; anything else is returned as the raw expression. Returns
    None if the variable is not set.
    """
    m = _re.search(rf"<<set\s+\${_re.escape(name)}(?:\s+to\s+|\s*=(?!=)\s*)(.+?)>>", text, _re.DOTALL)
    if not m:
        return None
    raw = m.group(1).strip()
    if len(raw) >= 2 and raw[0] in ("'", '"') and raw[-1] == raw[0]:
        return raw[1:-1]
    try:
        return int(raw)
    except ValueError:
        try:
            return float(raw)
        except ValueError:
            return raw


def passage_links(text: str) -> list:
    """Every passage a scene's text links to, in order, without duplicates.

    Covers [[links]] (including those inside <<area>> hotspots) and image-links
    [img[src][Target]]. The ways on that commands write (a button's quoted
    destination, <<goto>>, random jumps) come from the story check's reading
    of the scene instead (story_rules.macro_exits, added in build_story_graph).
    """
    targets: list = []
    for body in _LINK_RE.findall(text) + _IMG_LINK_RE.findall(text):
        target = _link_target(body)
        if target and target not in targets:
            targets.append(target)
    return targets


def _truthy(value) -> bool:
    """A StoryInit value as a boolean (`true`, 1, "true" are true)."""
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return bool(value)


def _scene_allows_run_away(text: str, story_default: bool) -> bool:
    """A scene may set $meta_allowRunAway itself (false for an ambush, true
    again in the scenes after it); otherwise the StoryInit value applies."""
    value = _extract_set_value(text, "meta_allowRunAway")
    return story_default if value is None else _truthy(value)


def build_story_graph(passages: list, story_data: dict) -> dict:
    """The navigation graph the adventure runtime validates steps against.

    Returns:
        start      - name of the start passage
        links      - {passage: [targets]} for every playable passage: its
                     [[links]] and image links, plus the ways on its commands
                     write (story_rules.macro_exits)
        endings    - {passage: "finished"} for every dead end that sets
                     $isEnding, in the main story or the Retreat story (its
                     endings are failures like any other; choosing Retreat is
                     what counts as running away, adventures.record_step)
        endingValues - {passage: [values]}: what each of those sets
                     ("success:dragon_slain", "failure"; several when its
                     <<if>> branches end differently)
        allowRunAway - whether Retreat may be entered from main-story scenes
                     ($meta_allowRunAway in StoryInit, the story default)
        noRetreat  - main-story scenes where Retreat can't be entered: a scene
                     that sets $meta_allowRunAway itself uses its own value
                     (e.g. false for an ambush), every other scene the default

    Only meaningful for a story that passed _check_twine_syntax (the submit
    validator), which guarantees unique names, a start passage, Retreat and
    LastResort, and independent main/Retreat graphs.
    """
    by_name = {p.get("name", ""): p for p in passages}
    start_id = (story_data or {}).get("startPassage", "")
    start = next((p.get("name", "") for p in passages if p.get("id") == start_id), "")

    # The story check's reading of each scene adds the ways on that commands
    # write (a button's quoted destination, <<goto>>, random jumps), so a step
    # along one of them is allowed. Imported here: story_rules imports this
    # module for the special scene names.
    from backend.story_rules import scene_outline

    links = {}
    values = {}
    for name, p in by_name.items():
        if name in _RESERVED_PASSAGES or name == TEST_CHARACTERS_PASSAGE:
            continue
        text = p.get("text", "")
        targets = passage_links(text)
        exits, endings = scene_outline(name, text)
        for target in exits:
            if target in by_name and target not in targets:
                targets.append(target)
        links[name] = targets
        if endings:
            values[name] = endings

    def reachable_from(root: str) -> set:
        seen: set = set()
        stack = [root]
        while stack:
            current = stack.pop()
            if current in seen or current not in links:
                continue
            seen.add(current)
            stack.extend(links[current])
        return seen

    main = reachable_from(start) if start else set()
    retreat = reachable_from(RETREAT_PASSAGE)

    endings = {}
    ending_values = {}
    for name in main | retreat:
        if not links.get(name) and name in values:
            endings[name] = "finished"
            ending_values[name] = values[name]

    story_init = by_name.get("StoryInit", {}).get("text", "")
    allow_run_away = _truthy(_extract_set_value(story_init, "meta_allowRunAway"))

    return {
        "start": start,
        "links": links,
        "endings": endings,
        "endingValues": ending_values,
        "mainScenes": sorted(main),
        "allowRunAway": allow_run_away,
        "noRetreat": sorted(
            name for name in main
            if not _scene_allows_run_away(by_name[name].get("text", ""), allow_run_away)
        ),
    }


def step_allowed(graph: dict, from_passage: str, to_passage: str) -> bool:
    """Whether a player may move from one scene to another.

    Allowed: a literal link out of the current scene; LastResort from anywhere
    (the engine's fault route); Retreat from any main-story scene when the
    story allows running away, unless that scene sets $meta_allowRunAway to
    false (or the story default is false and the scene doesn't set it true).
    """
    if to_passage == LAST_RESORT_PASSAGE:
        return True
    if to_passage in graph["links"].get(from_passage, []):
        return True
    if (
        to_passage == RETREAT_PASSAGE
        and from_passage in graph.get("mainScenes", [])
        and (
            from_passage not in graph["noRetreat"]
            if "noRetreat" in graph
            # graphs saved before per-scene $meta_allowRunAway
            else graph.get("allowRunAway")
        )
    ):
        return True
    return False
