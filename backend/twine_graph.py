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

# $isEnding records how a run concluded. true = the story officially ended, so
# the playthrough counts and the player is charged; a terminal (link-less) story
# passage must carry it so the story is known to be completable.
_ENDING_MACRO = "<<set $isEnding to true>>"

# false = the run ended through a platform fault (a broken/missing scene routed
# the player to LastResort), so the playthrough does NOT count and the player is
# not charged. LastResort must carry this.
_NOT_ENDING_MACRO = "<<set $isEnding to false>>"

# The always-available voluntary-exit scene and the fault-recovery scene. Both
# are required by the submit validator.
RETREAT_PASSAGE = "Retreat"
LAST_RESORT_PASSAGE = "LastResort"

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
_IMG_LINK_RE = _re.compile(r"\[img\[[^\]]*\]\[([^\]]+?)\]")


def _extract_set_value(text: str, name: str):
    """Return the value of `<<set $name to VALUE>>` from a passage's text.

    Strings (single/double quoted) come back unquoted; integers and floats are
    coerced to numbers; anything else is returned as the raw expression. Returns
    None if the variable is not set.
    """
    m = _re.search(rf"<<set\s+\${_re.escape(name)}\s+to\s+(.+?)>>", text, _re.DOTALL)
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
    [img[src][Target]]. Computed links (<<goto $var>>, <<link>> with an
    expression) are not seen here, so a story that relies on them cannot be
    stepped through - the step endpoint only accepts literal links.
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


def build_story_graph(passages: list, story_data: dict) -> dict:
    """The navigation graph the adventure runtime validates steps against.

    Returns:
        start      - name of the start passage
        links      - {passage: [targets]} for every playable passage
        endings    - {passage: "finished" | "run_away"} for every terminal scene
                     marked with $isEnding true. Endings reached from the start
                     passage finish the story; those in the Retreat graph mean
                     the party ran away.
        allowRunAway - whether Retreat may be entered from any main-story scene
                     ($meta_allowRunAway in StoryInit)

    Only meaningful for a story that passed _check_twine_syntax (the submit
    validator), which guarantees unique names, a start passage, Retreat and
    LastResort, and independent main/Retreat graphs.
    """
    by_name = {p.get("name", ""): p for p in passages}
    start_id = (story_data or {}).get("startPassage", "")
    start = next((p.get("name", "") for p in passages if p.get("id") == start_id), "")

    links = {
        name: passage_links(p.get("text", ""))
        for name, p in by_name.items()
        if name not in _RESERVED_PASSAGES
    }

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
    for name in main | retreat:
        if not links.get(name) and _ENDING_MACRO in by_name[name].get("text", ""):
            endings[name] = "run_away" if name in retreat else "finished"

    story_init = by_name.get("StoryInit", {}).get("text", "")
    allow_run_away = _truthy(_extract_set_value(story_init, "meta_allowRunAway"))

    return {
        "start": start,
        "links": links,
        "endings": endings,
        "mainScenes": sorted(main),
        "allowRunAway": allow_run_away,
    }


def step_allowed(graph: dict, from_passage: str, to_passage: str) -> bool:
    """Whether a player may move from one scene to another.

    Allowed: a literal link out of the current scene; LastResort from anywhere
    (the engine's fault route); Retreat from any main-story scene when the
    story allows running away.
    """
    if to_passage == LAST_RESORT_PASSAGE:
        return True
    if to_passage in graph["links"].get(from_passage, []):
        return True
    if (
        to_passage == RETREAT_PASSAGE
        and graph.get("allowRunAway")
        and from_passage in graph.get("mainScenes", [])
    ):
        return True
    return False
