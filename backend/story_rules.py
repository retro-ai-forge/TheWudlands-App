"""The story check: docs/STORY-RULES.md applied to a story's scenes on submit.

SugarCube runs much of what an author writes as JavaScript: every <<set>>,
<<if>> and <<print>>, link setters, macro arguments in backquotes, and even a
link's text ([[alert(1)|Cave]] runs alert - Wikifier.helpers.evalText in
SugarCube 2.37.3). So this is an allow-list, not a search for bad words: each
scene is read the way SugarCube reads it, without running anything, and only
the forms the rules describe are accepted. A refusal names the scene, the
line and an accepted form.

Each finding has a weight (docs/STORY-RULES.md "How the check decides"):
BLOCK refuses the submit - only the worst cases (code or CSS in the wrong
place, anything that reaches outside the story, SugarCube's system names) and
the platform's and game's rules. Everything else is a warning stored with the
submission: CODE (program code, or something the check can't read - the story
is marked hasCode) and UNSUPPORTED (something the platform can't play yet)
make the story wait - it isn't approved until there are rules for it - and
NOTE leaves it to the reviewer. When in doubt a finding is CODE, so nothing
the check can't read reaches the shared engine workers.

Used by auth_routes._check_twine_syntax, which runs on submit, on a
reviewer's Save review and again on Approve. The structure rules (links lead to
real scenes, endings, Retreat, LastResort, StoryInit's metadata and cover) and
the image rules stay there; this module covers what a scene may contain, the
special scenes and tags, the stylesheet and the Legend focus.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from backend import legend as _legend
from backend.character_creation import BIRTHSIGNS, GENDERS, NO_PROFESSION, RACE_GROUPS
from backend.items_catalog import ITEM_CATALOG_ENTRIES
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.twine_graph import LAST_RESORT_PASSAGE, TEST_CHARACTERS_PASSAGE

# The one story format the platform runs (the editor's built-in SugarCube, and
# the engine's). A story names it in storyData; nothing else is accepted, so a
# story can't ask for a format the platform doesn't ship.
FORMAT_NAME = "SugarCube"
FORMAT_VERSION = "2.37.3"

# ── Characters ($char, $lead) ────────────────────────────────────────────────

NAME_FIELDS = ("firstName", "lastName", "name")
LIST_FIELDS = ("race", "gender", "birthsign", "class1", "class2", "prof1", "prof2", "prof3")
NUMBER_FIELDS = (
    "might", "agility", "endurance", "precision", "will", "insight", "lore", "presence",
    "classLvl1", "classLvl2", "profLvl1", "profLvl2", "profLvl3",
)
EQUIPMENT_FIELD = "equipment"
LEGEND_FIELDS = _legend.LEGEND_KEYS
CHARACTER_FIELDS = NAME_FIELDS + LIST_FIELDS + NUMBER_FIELDS + (EQUIPMENT_FIELD,) + LEGEND_FIELDS
PARTY_MAX = 4

ITEM_IDS = frozenset(entry.id for entry in ITEM_CATALOG_ENTRIES)
# A family id ("rope") in .includes() means any tier, an item id ("rope_2")
# that tier or better: the engine lists each carried item with its family id
# and every lower tier (APP_INTEGRATION_HEADLESS.md "Still to align").
ITEM_FAMILY_IDS = frozenset(entry.family_id for entry in ITEM_CATALOG_ENTRIES)
EQUIPMENT_IDS = ITEM_IDS | ITEM_FAMILY_IDS

# Most a story can move one Legend pair for one character, and how many pairs
# it may change at all (docs/STORY-RULES.md "Legend").
LEGEND_POINTS_MAX = 10
LEGEND_PAIRS_MAX = 2
LEGEND_CHANGE_MAX = 100
_PAIR_OF = {name: pair for pair in _legend.LEGEND_PAIRS for name in pair}


def list_values(field_name: str) -> Optional[frozenset]:
    """The values a fixed-list field can hold, or None when any is fine
    (classes don't exist in the game yet)."""
    if field_name == "race":
        return frozenset(RACE_GROUPS)
    if field_name == "gender":
        return frozenset(GENDERS)
    if field_name == "birthsign":
        return frozenset(BIRTHSIGNS)
    if field_name.startswith("prof"):
        return frozenset(PROFESSION_CATEGORIES) | {NO_PROFESSION}
    return None


def pair_key(name: str) -> str:
    """A Legend pair as stored in legendPoints, e.g. "mercy-cruelty"."""
    first, second = _PAIR_OF[name]
    return f"{first}-{second}"


# ── Special scenes and tags ──────────────────────────────────────────────────

# SugarCube's special passages other than StoryInit: they run on every scene,
# replace the page or fill the UI bar. Only StoryInit, Retreat and LastResort
# (and the editor's TestCharacters) are special in a Wudlands story.
REFUSED_PASSAGES = frozenset({
    "PassageReady", "PassageDone", "PassageHeader", "PassageFooter",
    "StoryInterface", "StoryCaption", "StoryMenu", "StoryBanner",
    "StorySubtitle", "StoryAuthor", "StoryShare", "StoryDisplayTitle",
})
# SugarCube 2 sets aside only `init` and `widget` passages (its codeTagNames);
# for a Twine 2 story it plays a `script` or `stylesheet` passage as an
# ordinary scene - the tags are Twine 1/Twee only - so the CSS goes in the
# Story Stylesheet and these tags are refused outright, whatever the case.
REFUSED_TAGS = frozenset({"widget", "init", "script", "stylesheet"})
# Media passages (the scene's text is the file). Twine.image has its own
# message in auth_routes._image_rule_errors.
REFUSED_MEDIA_TAGS = frozenset({"twine.audio", "twine.video", "twine.vtt"})
# Passages with these tags aren't scenes (Twine.image is reported by
# auth_routes._image_rule_errors): no structure rules for them.
NON_SCENE_TAGS = REFUSED_TAGS | REFUSED_MEDIA_TAGS | {"twine.image"}

# ── What a scene may hold ────────────────────────────────────────────────────

ALLOWED_HTML_TAGS = frozenset({
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "small",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "label",
})
# Reported by auth_routes._image_rule_errors ("could load a picture from
# outside the story"), so not again here.
_MEDIA_TAGS = frozenset({
    "img", "image", "picture", "source", "svg", "video", "audio", "iframe", "object", "embed", "link",
})
_MEDIA_ATTRIBUTES = frozenset({"src", "srcset", "poster", "background"})
# Tags and attributes that load from or lead outside the story: refused (BLOCK).
_OUTSIDE_TAGS = frozenset({"a", "frame", "frameset", "applet", "meta", "base", "form", "portal"})
_OUTSIDE_ATTRIBUTES = frozenset({
    "href", "xlink:href", "action", "formaction", "ping", "srcdoc", "data", "codebase",
    "manifest", "cite", "longdesc", "usemap", "icon", "profile", "archive", "classid",
})
_CLASS_VALUE_RE = re.compile(r"[A-Za-z0-9_ -]*")

# Characters quoted text can't hold: they could read as a command, a link, a
# variable or code once SugarCube shows the text.
_FORBIDDEN_IN_QUOTES = frozenset("<>[]{}$\\`")

# Link and button texts: SugarCube evaluates them as JavaScript before showing
# them, so they are plain words. No ( = + and the like, so nothing can be
# called, set or counted up, and no straight double quote (SugarCube reads it
# as the start of a quoted part of the link).
_TEXT_PUNCTUATION = frozenset(" .,!?':;-\u2019\u2018\u201c\u201d\u2026\u2013\u2014")
# "new X.y" calls X.y as a constructor and "delete X.y" removes it, even
# without brackets - not words a link text needs in that order.
_TEXT_MEMBER_CALL_RE = re.compile(r"\b(?:new|delete)\s+[^\W\d_]\w*\s*\.\s*[^\W\d_]")

_CHOICE_VARIABLE_RE = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)")
_FOR_RE = re.compile(
    r"\s*(?:(_[A-Za-z][A-Za-z0-9_]*)\s*,\s*)?(_[A-Za-z][A-Za-z0-9_]*)\s+range\s+\$char\s*"
)

# Platform variables a story never sets: the party, and a choice can't store
# into the platform's own values either. $follows is the ending that opened a
# follow-up story: the platform sets it at the start, the story only reads it.
_PARTY_VARIABLES = frozenset({"char", "lead"})
_FOLLOWS_VARIABLE = "follows"
_ENDING_VARIABLE = "isEnding"
_SCENE_META_VARIABLE = "meta_allowRunAway"

# How a run ends (docs/STORY-RULES.md "Endings"): $isEnding is set to one of
# these. success and failure end the main story; the Retreat story ends only
# in failures (running away is a failure, counted with the others - the
# platform tells a run-away by the Retreat graph). Both may carry the ending's
# name after a colon ("success:dragon_slain", "failure:fled_the_crypt"), are
# recorded for the character and can be followed. lastresort is LastResort's
# (the engine failed: the run is given back), never named or recorded.
SUCCESS, FAILURE, LASTRESORT = "success", "failure", "lastresort"
ENDING_NAME_MAX = 40
_ENDING_RE = re.compile(
    rf"(?P<kind>{SUCCESS}|{FAILURE})(?::(?P<name>[A-Za-z][A-Za-z0-9_-]{{0,{ENDING_NAME_MAX - 1}}}))?"
    rf"|(?P<plain>{LASTRESORT})"
)
# Every success and failure ending is declared once in StoryInit with a teaser
# the platform shows to the characters who reached it.
RECORDED_KINDS = (SUCCESS, FAILURE)
ENDINGS_VARIABLE = "meta_endings"
ENDING_TEASER_MAX = 300
_ENDING_EXAMPLE = '<<set $isEnding to "success">>'
ENDINGS_EXAMPLE = (
    '<<set $meta_endings to {"success": "You reached the coast.", "failure": "The desert kept you.", '
    '"failure:fled": "You turned back."}>>'
)
_ENDING_VALUES = (
    '$isEnding is set to "success" or "failure" - a name may follow after a colon, like "success:dragon_slain" '
    '(the Retreat story ends only in failures) - or "lastresort" (only in LastResort), '
    f"like {_ENDING_EXAMPLE}"
)
_NO_RETREAT_VALUE = (
    '"retreat" isn\'t an ending value - running away is a failure, so an ending of the Retreat story sets '
    '"failure" or a named one, like <<set $isEnding to "failure:fled_the_crypt">>'
)


def ending_kind(value) -> Optional[str]:
    """success, failure or lastresort for a valid $isEnding value
    ("success:dragon_slain" is a success), None for anything else."""
    if not isinstance(value, str):
        return None
    m = _ENDING_RE.fullmatch(value)
    if not m:
        return None
    return m.group("kind") or m.group("plain")

# Names that reach the engine or the browser: a clearer message than
# "unknown word" (any word outside the rules is refused either way).
_ENGINE_WORDS = frozenset({
    "Config", "State", "Engine", "Story", "Save", "setup", "settings", "window", "document",
    "SugarCube", "Macro", "Wikifier", "Dialog", "UI", "UIBar", "Scripting", "Setting",
    "Settings", "Template", "L10n", "LoadScreen", "Fullscreen", "SimpleAudio", "jQuery",
    "globalThis", "self", "top", "parent", "frames", "eval", "Function", "fetch", "location",
    "navigator", "localStorage", "sessionStorage", "alert", "prompt", "confirm", "console",
    "previous", "passage", "tags", "time", "turns", "lastVisited", "visitedTags",
    "importScripts", "importStyles", "memorize", "recall", "forget", "clone",
    "Array", "Object", "Math", "JSON", "Date", "String", "Number", "Boolean", "Symbol",
    "Reflect", "Proxy", "Promise", "constructor", "prototype", "__proto__",
})

_CODE = "runs program code"

# ── How much a finding weighs ────────────────────────────────────────────────

BLOCK, CODE, UNSUPPORTED, NOTE = "block", "code", "unsupported", "note"
# Warnings that keep a story from being approved until there are rules for them.
HOLDING_KINDS = frozenset({CODE, UNSUPPORTED})

# The worst cases, refused outright. The same text wherever they are found,
# so a place the scan and the reading both report shows once.
_JS_PLACE = "JavaScript goes in the Story JavaScript, not in a scene"
_CSS_PLACE = "CSS goes in the Story Stylesheet, not in a scene"
_WEB_ADDRESS = "web addresses aren't accepted - SugarCube makes them links out of the story"
_OUTSIDE = (
    "this loads or leads outside the story - images come from the story's Images list "
    "and ways on are links like [[Go north|North]]"
)
# Names that reconfigure SugarCube or reach the browser, Node or the network.
# Refused by name in scenes and in the Story JavaScript - a guard rail against
# mistakes and copied attacks only: JavaScript can reach anything in disguise,
# which is why a story with any code waits (hasCode) until there are rules.
SYSTEM_WORDS = frozenset({
    "Config", "Engine", "Save", "UI", "UIBar", "Dialog", "SugarCube", "Scripting",
    "eval", "Function", "globalThis", "require", "process", "module", "fetch",
    "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "importStyles", "import",
    "Worker", "SharedWorker", "localStorage", "sessionStorage", "indexedDB", "location",
})
# Members that lead from any value to the code behind it (x.constructor.constructor).
SYSTEM_MEMBERS = frozenset({"constructor", "__proto__", "prototype"})


def _system_word(word: str) -> str:
    return f"'{word}' reaches into SugarCube or the browser - stories don't use it"


_LIVE = "needs a live browser - a scene is sent to the player as finished text, images and buttons"
_PAGE = "changes the page without a new scene - link to a new scene instead, like [[Open the door|Door]]"
_TYPING = 'players never type anything - offer choices instead, like <<radiobutton "$path" "north">>'
_REFUSED_MACROS = {
    "script": (_JS_PLACE, BLOCK),
    "run": (_JS_PLACE, BLOCK),
    "=": ("use <<print>>, like <<print $gold>>", CODE),
    "-": ("use <<print>>, like <<print $gold>>", CODE),
    "textbox": (_TYPING, UNSUPPORTED), "textarea": (_TYPING, UNSUPPORTED),
    "numberbox": (_TYPING, UNSUPPORTED), "passwordbox": (_TYPING, UNSUPPORTED),
    "include": ("a scene can't be pulled into another yet - link to it, like [[Cave]]", UNSUPPORTED),
    "display": ("a scene can't be pulled into another yet - link to it, like [[Cave]]", UNSUPPORTED),
    **{name: (_LIVE, UNSUPPORTED) for name in (
        "timed", "repeat", "stop", "next", "type", "audio", "cacheaudio", "createaudiogroup",
        "createplaylist", "masteraudio", "playlist", "removeaudiogroup", "removeplaylist",
        "track", "waitforaudio",
    )},
    **{name: (_PAGE, UNSUPPORTED) for name in (
        "linkreplace", "linkappend", "linkprepend", "append", "prepend", "replace", "remove",
        "addclass", "removeclass", "toggleclass", "copy", "do", "redo",
    )},
    "back": ("the server controls the way back - use a link, like [[Go back|Camp]]", UNSUPPORTED),
    "return": ("the server controls the way back - use a link, like [[Go back|Camp]]", UNSUPPORTED),
    "actions": ("use links, like [[Go north|North]]", UNSUPPORTED),
    "choice": ("use links, like [[Go north|North]]", UNSUPPORTED),
    "break": ("<<for>> always goes through the whole party", NOTE),
    "continue": ("<<for>> always goes through the whole party", NOTE),
    "unset": ("story variables stay set - give them another value instead", NOTE),
    "widget": ("widgets aren't accepted yet - write the commands out", UNSUPPORTED),
    "capture": (_CODE, CODE),
    "silent": (_CODE, CODE), "silently": (_CODE, CODE), "done": (_CODE, CODE),
}
# Refused commands that wrap a body: skipped up to their closing tag, so the
# body (often raw JavaScript) doesn't add a page of follow-on errors.
_REFUSED_CONTAINERS = frozenset({
    "script", "linkreplace", "linkappend", "linkprepend", "append", "prepend", "replace",
    "timed", "repeat", "widget", "done", "silent", "silently", "capture", "type",
    "createaudiogroup", "createplaylist", "do",
})

_CONTAINERS = frozenset({"if", "switch", "for", "link", "button", "listbox", "cycle", "nobr"})
_ACTION_MACROS = frozenset({"link", "button"})
_CHOICE_LISTS = frozenset({"listbox", "cycle"})
_INIT_MACROS = frozenset({"set", "if", "elseif", "else", "switch", "case", "default"})

_MAX_ERRORS_PER_SCENE = 20

# Where SugarCube's wikifier finds markup. Its patterns are JavaScript: there
# `(?:.|\n)` never crosses \r, \u2028 or \u2029, so neither do ours (_ANY) -
# a comment or verbatim part that crosses one is no comment for SugarCube,
# and what follows is read as markup.
_URL = r"(?:file|https?|mailto|ftp|javascript|irc|news|data):[^\s'\"]+"
_MARKUP_START = re.compile(
    r"<!--|<<|\[\[|\[[<>]?img\[|\"{3}|<nowiki>|</?[A-Za-z]|\$\$|[$_][A-Za-z]|@@|/\*|/%"
    rf"|(?-i:{_URL})",
    re.IGNORECASE,
)
_ANY = "[^\r\u2028\u2029]"
# SugarCube's verbatimText: shown exactly as written, never read as markup.
_VERBATIM = re.compile(rf"\"{{3}}{_ANY}*?\"{{3}}|<nowiki>{_ANY}*?</nowiki>", re.IGNORECASE)
_HTML_COMMENT = re.compile(rf"<!--{_ANY}*?-->")
_BLOCK_COMMENT = re.compile(rf"/(%|\*){_ANY}*?\1/")
_URL_RE = re.compile(_URL)
_IMAGE_OPEN = re.compile(r"\[[<>]?img\[", re.IGNORECASE)
# SugarCube's naked variable: a name, then .name, [0], ["name"] or [$name] parts.
_IDENTIFIER = r"[$A-Za-z_][$0-9A-Za-z_]*"
_NAKED_VARIABLE = re.compile(
    rf"[$_]{_IDENTIFIER}"
    rf"(?:\.{_IDENTIFIER}|\[\d+\]|\[\"(?:\\.|[^\"\\])+\"\]|\['(?:\\.|[^'\\])+'\]|\[[$_]{_IDENTIFIER}\])*"
)
_MACRO_NAME = re.compile(r"(/?)([A-Za-z][\w-]*|=|-)")
_HTML_TAG = re.compile(
    r"<(/?)([A-Za-z][A-Za-z0-9-]*)"
    r"((?:\s+[^\s\"'>/=]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'=<>`]+))?)*)"
    r"\s*(/?)>"
)
# What may stand inside a <label> besides its text (see _Scene.inside_label).
_LABEL_CONTENT = re.compile(r"<<\s*(?:radiobutton|checkbox)\b|</label\s*>|<!--", re.IGNORECASE)
_HTML_ATTRIBUTE = re.compile(r"([^\s\"'>/=]+)(?:\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s\"'=<>`]+))?")

# The worst cases in a part the reading skips (see _Scene.scan_unread).
# An HTML tag's < never follows another < (<<link ...>> is a command, not <link>).
_HARD_BLOCKS = (
    (re.compile(r"<<\s*(?:script|run)\b", re.IGNORECASE), _JS_PLACE),
    (re.compile(r"(?<!<)<\s*script\b", re.IGNORECASE), _JS_PLACE),
    (re.compile(r"(?<!<)<[A-Za-z][^<>]*?\s(?:on[A-Za-z]+|@[\w.:-]+|sc-eval:[\w.:-]*)\s*=", re.IGNORECASE), _JS_PLACE),
    (re.compile(r"javascript\s*:", re.IGNORECASE), _JS_PLACE),
    (re.compile(r"(?<!<)<\s*style\b", re.IGNORECASE), _CSS_PLACE),
    (_URL_RE, _WEB_ADDRESS),
    (re.compile(r"\burl\s*\(|@import\b|\bimage-set\s*\(", re.IGNORECASE), _OUTSIDE),
    (re.compile(
        r"(?<!<)<\s*(?:a|iframe|frame|frameset|object|embed|applet|link|meta|base|form|portal)\b", re.IGNORECASE
    ), _OUTSIDE),
)
# In CSS written in a scene (see _Scene.scan_css).
_CSS_HARD_BLOCKS = (
    (re.compile(r"\burl\s*\(|@import\b|\bimage-set\s*\(|\bimage\s*\(|\bcross-fade\s*\(|\belement\s*\(", re.IGNORECASE), _OUTSIDE),
    (re.compile(r"\bexpression\s*\(|-moz-binding|\bbehavior\s*:|javascript\s*:", re.IGNORECASE), _JS_PLACE),
    (re.compile(r"\\"), "backslash escapes aren't accepted in CSS - they can hide the words above"),
)
# A command's arguments; quoted text and [[links]] in them (blanked before the
# system names are looked for: words there are text, not names).
_MACRO_ARGUMENTS_RE = re.compile(r"<<\s*/?[A-Za-z][\w-]*((?:[^>]|>(?!>))*)>>")
_QUOTED_OR_LINK_RE = re.compile(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|\[\[(?:[^\]]|\](?!\]))*\]\]")
_SYSTEM_WORD_RE = re.compile(r"(?<![$\w.])(" + "|".join(sorted(SYSTEM_WORDS)) + r")(?![\w$])")
_SYSTEM_MEMBER_RE = re.compile(r"\.\s*(" + "|".join(sorted(SYSTEM_MEMBERS)) + r")(?![\w$])")


class _Refused(Exception):
    """One refusal; the message says what is wrong and what to write instead,
    the kind how much it weighs (BLOCK, CODE, UNSUPPORTED or NOTE)."""

    def __init__(self, message: str, kind: str = CODE):
        super().__init__(message)
        self.kind = kind


@dataclass
class StoryCheck:
    """What check_story found: `errors` refuse the submit (BLOCK, as text);
    `warnings` are stored with the submission ({place, line, kind, message});
    `has_code` when the story has its own JavaScript or a CODE warning;
    `waiting` the scenes with a holding warning (the check may not see all
    their ways on); the Legend points per pair (pair key -> points, at most
    LEGEND_POINTS_MAX); `endings` the $isEnding values each scene sets (scene
    -> values in order, several when <<if>> branches end differently);
    `ending_scenes` every scene that sets $isEnding at all, also to a refused
    value (so it isn't called a dead end without one); and `teasers` the
    $meta_endings StoryInit declares (tag -> teaser), None when it declares
    none."""

    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    has_code: bool = False
    waiting: set = field(default_factory=set)
    legend_points: dict = field(default_factory=dict)
    endings: dict = field(default_factory=dict)
    ending_scenes: set = field(default_factory=set)
    teasers: Optional[dict] = None

    @property
    def holds(self) -> bool:
        """Whether a warning keeps the story from being approved."""
        return any(w["kind"] in HOLDING_KINDS for w in self.warnings)


def finding(place: str, line: Optional[int], kind: str, message: str) -> dict:
    """One warning as stored with a submission."""
    return {"place": place, "line": line, "kind": kind, "message": message}


def finding_text(item: dict) -> str:
    """A warning as one line of text, like the refusals."""
    where = item.get("place") or ""
    if item.get("line"):
        where = f"{where}, line {item['line']}" if where else f"line {item['line']}"
    return f"{where}: {item['message']}" if where else item["message"]


# ── Plain text and quoted text ───────────────────────────────────────────────


def plain_text_problem(text: str) -> Optional[str]:
    """Why a link or button text isn't plain words, or None if it is."""
    if not text.strip():
        return "a link or button needs a text"
    bad = sorted({ch for ch in text if not (ch.isalpha() or ch.isdigit() or ch in _TEXT_PUNCTUATION)})
    if bad:
        shown = " ".join("space" if ch.isspace() else ch for ch in bad)
        return (
            f"a link or button text is plain words - letters, digits, spaces and . , ! ? ' : ; - "
            f"(found {shown})"
        )
    if "--" in text:
        return "a link or button text can't contain -- (write a single dash)"
    if _TEXT_MEMBER_CALL_RE.search(text):
        return "a link or button text can't read like program code (new or delete before a name with a dot)"
    return None


STORY_NAME_MAX = 100


def story_name_problem(name) -> Optional[str]:
    """Why a story's name isn't accepted, or None if it is.

    The editor writes the name HTML-escaped into the story page, but SugarCube
    decodes it again and shows it in its UI bar as markup (UIBar
    setDisplayTitle), so a name like </title><script>...</script> would run.
    It is also put inside a JavaScript string there, where a backslash or a
    line break stops SugarCube from starting. Hence plain words, like a link
    text.
    """
    if not isinstance(name, str) or not name.strip():
        return "The story needs a name (Story > Rename)"
    if len(name) > STORY_NAME_MAX:
        return f"The story name is longer than {STORY_NAME_MAX} characters"
    bad = sorted({ch for ch in name if not (ch.isalpha() or ch.isdigit() or ch in _TEXT_PUNCTUATION)})
    if bad:
        shown = " ".join("space" if ch.isspace() else ch for ch in bad)
        return (
            "The story name is plain words - letters, digits, spaces and . , ! ? ' : ; - "
            f"(found {shown})"
        )
    return None


def _check_quoted(content: str) -> None:
    bad = sorted(set(content) & _FORBIDDEN_IN_QUOTES)
    if bad:
        raise _Refused(
            "quoted text can't contain " + " ".join(bad)
            + " - they could read as a command, a link or a variable; write plain words"
        )
    if "@@" in content:
        raise _Refused("quoted text can't contain @@ - write plain words")
    if _URL_RE.search(content):
        # Printed, SugarCube would make it a link out of the story.
        raise _Refused("quoted text can't contain a web address", BLOCK)


# ── Expressions ──────────────────────────────────────────────────────────────

NUM, STR, BOOL, ANY, LIST, CHAR, PARTY, NAME, ENUM, EQUIP, MAP = (
    "number", "text", "true/false", "value", "list", "character", "party", "name", "fixed list", "equipment",
    "map",
)

_TOKEN = re.compile(
    r"(?P<ws>\s+)"
    r"|(?P<bad>\+\+|--|===|!==|&&|\|\||\*\*|=>|\?\.|\?\?)"
    r"|(?P<num>\d+(?:\.\d+)?(?![\w.]))"
    r"|(?P<str>\"[^\"\n]*\"|'[^'\n]*')"
    r"|(?P<var>\$[A-Za-z_][A-Za-z0-9_]*(?![\w$]))"
    r"|(?P<tmp>_[A-Za-z][A-Za-z0-9_]*(?![\w$]))"
    r"|(?P<word>[A-Za-z][A-Za-z0-9_]*(?![\w$]))"
    # { } and : only in <<set $meta_endings to {...}>> (_tokens, endings_literal).
    r"|(?P<op>\+=|-=|\*=|/=|==|!=|>=|<=|[-+*/%<>()\[\],.{}:])"
)
_BAD_TOKENS = {
    "++": "++ isn't accepted - write $x += 1",
    "--": "-- isn't accepted - write $x -= 1",
    "===": "use is to compare", "!==": "use isnot to compare",
    "&&": "use and", "||": "use or", "**": "** isn't accepted - multiply instead",
    "=>": f"=> {_CODE}", "?.": "?. isn't accepted", "??": "?? isn't accepted",
}
_BAD_CHARACTERS = {
    "=": "use to to set a value (<<set $gold to 5>>) and is to compare (<<if $gold is 5>>)",
    "!": "use not, like <<if not $cursed>>",
    "&": "use and", "|": "use or",
    "`": "backquotes run program code",
    "{": "{ } aren't accepted - lists are written with [ ] in StoryInit",
    "}": "{ } aren't accepted",
    ";": "; isn't accepted - separate changes with a comma, like <<set $a to 1, $b to 2>>",
    "?": "? : isn't accepted - use <<if>>",
    ":": 'a colon isn\'t accepted here - inside quotes it\'s fine, like "success:met_queen"; '
         "to choose between two values, use <<if>>",
    "\\": "\\ isn't accepted",
    "\"": "a quote isn't closed", "'": "a quote isn't closed",
    "@": "@ isn't accepted", "#": "# isn't accepted", "~": "~ isn't accepted", "^": "^ isn't accepted",
}
_COMPARE_WORDS = frozenset({"is", "isnot", "gt", "gte", "lt", "lte"})
_COMPARE_OPS = frozenset({"==", "!=", ">", ">=", "<", "<="})
_EQUALITY = frozenset({"is", "isnot", "==", "!="})
_KEYWORDS = frozenset({"to", "and", "or", "not", "range"}) | _COMPARE_WORDS
_FUNCTIONS = frozenset({"random", "either", "visited"})


@dataclass
class _Tok:
    kind: str
    value: str


@dataclass
class _Val:
    type: str
    literal: object = None
    field: Optional[str] = None
    target: Optional[tuple] = None
    who: str = ""


_COMMENT_IN_COMMAND = "comments go outside a command, like <<set $gold to 5>> <!-- a note -->"


# The one place { } and : are read: <<set $meta_endings to {...}>> (only in
# StoryInit, endings_literal says so anywhere else).
_ENDINGS_ASSIGNMENT = re.compile(rf"\s*\${ENDINGS_VARIABLE}\s+to\s*{{")
_MAP_CHARACTERS = frozenset("{}:")
# The platform's values a story never removes (<<unset>>).
_PLATFORM_VALUE_RE = re.compile(r"\$(?:isEnding|follows|char|lead|meta_\w*)(?![\w$])")
# <<set $isEnding to ...>>, and the teaser written right after the ending:
# <<set $isEnding to "success:met_queen": "The queen remembers you.">>
_ENDING_SET = re.compile(r"\s*\$isEnding\s+to\b")
_TEASER_IN_SCENE = re.compile(r"""\s*\$isEnding\s+to\s*(["'])([^"'\n]*)\1\s*:\s*(["'])([^"'\n]*)\3\s*$""")


def _tokens(source: str, allow_map: bool = False) -> list:
    if "<!--" in source:
        raise _Refused(_COMMENT_IN_COMMAND)
    out = []
    pos = 0
    while pos < len(source):
        m = _TOKEN.match(source, pos)
        if not m:
            ch = source[pos]
            raise _Refused(_BAD_CHARACTERS.get(ch, f"'{ch}' isn't accepted here"))
        kind = m.lastgroup
        if kind == "bad":
            raise _Refused(_BAD_TOKENS[m.group(0)])
        if kind == "op" and m.group(0) in _MAP_CHARACTERS and not allow_map:
            raise _Refused(_BAD_CHARACTERS[m.group(0)])
        if kind != "ws":
            out.append(_Tok(kind, m.group(0)))
        pos = m.end()
    out.append(_Tok("end", ""))
    return out


class _Expression:
    """One TwineScript expression, typed as it is parsed. Raises _Refused."""

    def __init__(self, source: str, scene: "_Scene"):
        try:
            self.toks = _tokens(source, allow_map=bool(_ENDINGS_ASSIGNMENT.match(source)))
        except _Refused as refused:
            if not _ENDING_SET.match(source):
                raise
            # An ending the check can't read is still an ending scene (no
            # "dead end without $isEnding" on top), and refused as an ending.
            scene.ends = True
            teaser = _TEASER_IN_SCENE.match(source)
            if teaser:
                tag, text = teaser.group(2), teaser.group(4)
                raise _Refused(
                    "the teaser goes in StoryInit, not in the ending scene - here only "
                    f'<<set $isEnding to "{tag}">>, and in StoryInit '
                    f'<<set $meta_endings to {{"{tag}": "{text}"}}>> (with your other endings)',
                    BLOCK,
                ) from None
            raise _Refused(str(refused), BLOCK) from None
        self.i = 0
        self.scene = scene

    # -- token helpers --

    def peek(self) -> _Tok:
        return self.toks[self.i]

    def take(self) -> _Tok:
        tok = self.toks[self.i]
        if tok.kind != "end":
            self.i += 1
        return tok

    def at(self, kind: str, value: Optional[str] = None) -> bool:
        tok = self.toks[self.i]
        return tok.kind == kind and (value is None or tok.value == value)

    def expect(self, kind: str, value: str, what: str) -> None:
        if not self.at(kind, value):
            found = self.peek().value or "the end"
            raise _Refused(f"expected {what} (found '{found}')")
        self.take()

    def done(self) -> None:
        if not self.at("end"):
            raise _Refused(f"unexpected '{self.peek().value}'")

    # -- entry points --

    def assignments(self) -> None:
        while True:
            self.assignment()
            if self.at("op", ","):
                self.take()
                continue
            break
        self.done()

    def condition(self) -> None:
        value = self.expression()
        self.done()
        self.require_value(value, "in a condition")

    def printable(self) -> None:
        value = self.expression()
        self.done()
        if value.type in (NAME, ENUM):
            return  # a character's name or fixed-list value, printed on its own
        self.require_value(value, "in <<print>>")

    def switch_value(self) -> Optional[str]:
        value = self.expression()
        self.done()
        if value.type == ENUM:
            return value.field
        self.require_value(value, "in <<switch>>")
        return None

    # -- assignment --

    def assignment(self) -> None:
        target = self.postfix(self.primary())
        tok = self.take()
        if tok.kind == "word" and tok.value == "to":
            op = "to"
        elif tok.kind == "op" and tok.value in ("+=", "-=", "*=", "/="):
            op = tok.value
        else:
            raise _Refused(
                "set a value with to, += or -=, like <<set $gold to 5>> or <<set $gold += 1>> "
                f"(found '{tok.value or 'the end'}')"
            )
        if op == "to" and self.at("op", "["):
            value = self.list_literal(target)
        elif op == "to" and self.at("op", "{"):
            value = self.endings_literal(target)
        else:
            value = self.expression()
            self.require_value(value, "in <<set>>")
        self.check_target(target, op, value)

    def list_literal(self, target: _Val) -> _Val:
        self.take()  # [
        if not self.scene.is_init or not (target.target and target.target[0] == "story"):
            raise _Refused(
                'lists are created only in StoryInit, as a story variable, like <<set $inventory to ["rope", "torch"]>>'
            )
        if not self.at("op", "]"):
            while True:
                item = self.unary()
                if item.literal is None or item.type not in (NUM, STR, BOOL):
                    raise _Refused('a list holds written-out values, like ["rope", "torch"] or [1, 2, 3]')
                if not self.at("op", ","):
                    break
                self.take()
        self.expect("op", "]", "] to close the list")
        return _Val(LIST)

    def endings_literal(self, target: _Val) -> _Val:
        """$meta_endings in StoryInit: every success and failure ending
        once (the Retreat story's too), each with its teaser - {"success:dragon_slain": "You
        killed the dragon."}. The only place { } are read; it's platform data,
        so every problem in it refuses the submit."""
        if target.target != ("story", ENDINGS_VARIABLE):
            raise _Refused(_BAD_CHARACTERS["{"])
        if not self.scene.is_init:
            raise _Refused(f"${ENDINGS_VARIABLE} is set in StoryInit", BLOCK)
        self.take()  # {
        teasers: dict = {}
        while not self.at("op", "}"):
            key = self.take()
            if key.kind != "str":
                raise _Refused(f"$meta_endings names each ending in quotes, like {ENDINGS_EXAMPLE}", BLOCK)
            tag = key.value[1:-1]
            if ending_kind(tag) not in RECORDED_KINDS:
                raise _Refused(
                    f'"{tag}" isn\'t a success or failure ending - $meta_endings declares them, '
                    'like "success" or "failure:captured" (lastresort needs no teaser)',
                    BLOCK,
                )
            if tag in teasers:
                raise _Refused(f'"{tag}" is declared twice in $meta_endings', BLOCK)
            self.expect("op", ":", f'a colon after "{tag}"')
            teaser = self.take()
            if teaser.kind != "str":
                raise _Refused(f'the teaser for "{tag}" is text in quotes, like {ENDINGS_EXAMPLE}', BLOCK)
            text = teaser.value[1:-1]
            try:
                _check_quoted(text)
            except _Refused as refused:
                raise _Refused(f'the teaser for "{tag}": {refused}', BLOCK) from None
            if not text.strip():
                raise _Refused(f'the teaser for "{tag}" is empty - one or two sentences for the player', BLOCK)
            if len(text) > ENDING_TEASER_MAX:
                raise _Refused(
                    f'the teaser for "{tag}" has {len(text)} characters - at most {ENDING_TEASER_MAX}', BLOCK
                )
            teasers[tag] = text
            if not self.at("op", ","):
                break
            self.take()
        self.expect("op", "}", "} to close $meta_endings")
        return _Val(MAP, literal=teasers)

    def check_target(self, target: _Val, op: str, value: _Val) -> None:
        kind, name = target.target if target.target else (None, None)
        # What a story may change is a game rule: always refused (BLOCK).
        if kind == "party":
            raise _Refused("the server sets the party - $char and $lead are never set", BLOCK)
        if kind == "story":
            if name in _PARTY_VARIABLES:
                raise _Refused(f"the server sets the party - ${name} is never set", BLOCK)
            if name == _FOLLOWS_VARIABLE:
                raise _Refused(
                    "the platform sets $follows to the ending that opened a follow-up story - "
                    "a story only reads it",
                    BLOCK,
                )
            if name == _ENDING_VARIABLE:
                self.scene.ends = True
                if self.scene.is_init:
                    raise _Refused("StoryInit never ends the story - an ending scene sets $isEnding", BLOCK)
                if self.scene.in_setter or self.scene.in_action():
                    # Set by a click, the ending would depend on what the
                    # player does in the scene, not on the scene reached.
                    raise _Refused(
                        "an ending is set when its scene is shown, never by a click - set it in the ending "
                        f"scene's own text (an <<if>> is fine), like {_ENDING_EXAMPLE}",
                        BLOCK,
                    )
                if not (op == "to" and value.type == STR and ending_kind(value.literal)):
                    if value.type == STR and str(value.literal).split(":")[0] == "retreat":
                        raise _Refused(_NO_RETREAT_VALUE, BLOCK)
                    old = "true and false aren't used any more - " if value.type == BOOL else ""
                    raise _Refused(old + _ENDING_VALUES, BLOCK)
                self.scene.endings.append(value.literal)
            elif name.startswith("meta_") and name != _SCENE_META_VARIABLE and not self.scene.is_init:
                raise _Refused(f"${name} is set in StoryInit", BLOCK)
            elif name == ENDINGS_VARIABLE:
                if not (op == "to" and value.type == MAP):
                    raise _Refused(
                        f"$meta_endings declares every success and failure ending with a teaser, "
                        f"like {ENDINGS_EXAMPLE}",
                        BLOCK,
                    )
                if self.scene.teasers is not None:
                    raise _Refused("$meta_endings is set once in StoryInit", BLOCK)
                self.scene.teasers = value.literal
        elif kind == "temp":
            pass
        elif kind == "legend":
            if op not in ("+=", "-="):
                raise _Refused(
                    f"Legend changes only with += or -= and a whole number, like <<set {target.who}.{name} += 3>>",
                    BLOCK,
                )
            amount = value.literal
            if not (value.type == NUM and isinstance(amount, int) and 0 < amount <= LEGEND_CHANGE_MAX):
                raise _Refused(
                    f"a Legend change is a whole number from 1 to {LEGEND_CHANGE_MAX}, "
                    f"like <<set {target.who}.{name} += 3>>",
                    BLOCK,
                )
            self.scene.legend.append((name, amount))
        elif kind == "attribute":
            raise _Refused(
                f"{target.who}.{name} only changes through the platform's checks and fights - "
                "a story changes only the characters' Legend",
                BLOCK,
            )
        elif kind == "character":
            raise _Refused(
                f"{target.who}.{name} can't be changed - a story changes only the characters' Legend", BLOCK
            )
        elif kind in ("loopchar", "loopindex"):
            raise _Refused(f"{name} belongs to the <<for>> loop and can't be set")
        else:
            raise _Refused("only a variable or a character's Legend value can be set, like <<set $gold to 5>>")

    # -- values --

    def require_value(self, value: _Val, where: str) -> None:
        """Refuse what may only be printed, compared with a quoted value or checked."""
        if value.type in (CHAR, PARTY):
            raise _Refused(
                f"a whole character can't be used {where} - use one of its values, like {value.who or '$lead'}.might"
            )
        if value.type == NAME:
            raise _Refused(
                f"names only appear in scene text, printed on their own, like <<print {value.who}.{value.field}>> "
                f"or {value.who}.{value.field} draws her sword."
            )
        if value.type == ENUM:
            raise _Refused(
                f"{value.who}.{value.field} can only be printed or compared with a quoted value, "
                f'like <<if {value.who}.{value.field} is "{self.example_value(value.field)}">>'
            )
        if value.type == EQUIP:
            raise _Refused(
                f'equipment is only checked with .includes("item"), like {value.who}.equipment.includes("rope")'
            )
        if value.type == LIST:
            raise _Refused('lists are created only in StoryInit, like <<set $inventory to ["rope", "torch"]>>')

    @staticmethod
    def example_value(field_name: str) -> str:
        values = list_values(field_name)
        return sorted(values)[0] if values else "warrior"

    def expression(self) -> _Val:
        return self.or_()

    def or_(self) -> _Val:
        left = self.and_()
        while self.at("word", "or"):
            self.take()
            right = self.and_()
            self.require_value(left, "with or")
            self.require_value(right, "with or")
            left = _Val(BOOL)
        return left

    def and_(self) -> _Val:
        left = self.not_()
        while self.at("word", "and"):
            self.take()
            right = self.not_()
            self.require_value(left, "with and")
            self.require_value(right, "with and")
            left = _Val(BOOL)
        return left

    def not_(self) -> _Val:
        if self.at("word", "not"):
            self.take()
            value = self.not_()
            self.require_value(value, "with not")
            return _Val(BOOL)
        return self.comparison()

    def comparison_op(self) -> Optional[str]:
        tok = self.peek()
        if (tok.kind == "word" and tok.value in _COMPARE_WORDS) or (tok.kind == "op" and tok.value in _COMPARE_OPS):
            return tok.value
        return None

    def comparison(self) -> _Val:
        left = self.additive()
        op = self.comparison_op()
        if op is None:
            return left
        self.take()
        right = self.additive()
        self.compare(left, op, right)
        if self.comparison_op():
            raise _Refused("compare two values at a time - join comparisons with and, like $a gt 1 and $a lt 5")
        return _Val(BOOL)

    def compare(self, left: _Val, op: str, right: _Val) -> None:
        for one, other in ((left, right), (right, left)):
            if one.type == ENUM:
                if op not in _EQUALITY:
                    raise _Refused(f"{one.who}.{one.field} is compared with is or isnot")
                if other.type != STR or other.literal is None:
                    raise _Refused(
                        f"{one.who}.{one.field} is compared with a quoted value, "
                        f'like {one.who}.{one.field} is "{self.example_value(one.field)}"'
                    )
                values = list_values(one.field)
                if values is not None and other.literal not in values:
                    raise _Refused(
                        f"\"{other.literal}\" isn't a {one.field} in the game - "
                        f"for example \"{self.example_value(one.field)}\""
                    )
                return
        self.require_value(left, "in a comparison")
        self.require_value(right, "in a comparison")

    def additive(self) -> _Val:
        left = self.multiplicative()
        while self.at("op", "+") or self.at("op", "-"):
            op = self.take().value
            right = self.multiplicative()
            self.require_value(left, f"with {op}")
            self.require_value(right, f"with {op}")
            left = _Val(ANY if op == "+" else NUM)
        return left

    def multiplicative(self) -> _Val:
        left = self.unary()
        while self.at("op", "*") or self.at("op", "/") or self.at("op", "%"):
            op = self.take().value
            right = self.unary()
            self.require_value(left, f"with {op}")
            self.require_value(right, f"with {op}")
            left = _Val(NUM)
        return left

    def unary(self) -> _Val:
        if self.at("op", "-"):
            self.take()
            value = self.unary()
            self.require_value(value, "with -")
            if value.type == NUM and isinstance(value.literal, (int, float)):
                return _Val(NUM, literal=-value.literal)
            return _Val(NUM)
        return self.postfix(self.primary())

    def primary(self) -> _Val:
        tok = self.take()
        if tok.kind == "num":
            return _Val(NUM, literal=float(tok.value) if "." in tok.value else int(tok.value))
        if tok.kind == "str":
            content = tok.value[1:-1]
            _check_quoted(content)
            return _Val(STR, literal=content)
        if tok.kind == "var":
            return self.story_variable(tok.value[1:])
        if tok.kind == "tmp":
            bound = self.scene.loop_binds().get(tok.value)
            if bound == "char":
                return _Val(CHAR, target=("loopchar", tok.value), who=tok.value)
            if bound == "index":
                return _Val(NUM, target=("loopindex", tok.value))
            return _Val(ANY, target=("temp", tok.value))
        if tok.kind == "word":
            if tok.value in ("true", "false"):
                return _Val(BOOL, literal=tok.value == "true")
            if tok.value in _FUNCTIONS:
                return self.function(tok.value)
            if tok.value in _KEYWORDS:
                raise _Refused(f"unexpected '{tok.value}'")
            if tok.value in SYSTEM_WORDS:
                raise _Refused(_system_word(tok.value), BLOCK)
            if tok.value in _ENGINE_WORDS:
                raise _Refused(
                    f"'{tok.value}' reaches the story engine's internals - "
                    "a story uses only its own variables and the characters"
                )
            raise _Refused(
                f"'{tok.value}' isn't a value - put text in quotes (\"{tok.value}\") "
                "and variables after $ ($gold)"
            )
        if tok.kind == "op" and tok.value == "(":
            inner = self.expression()
            self.expect("op", ")", ") to close the bracket")
            return _Val(inner.type, field=inner.field, who=inner.who)
        if tok.kind == "op" and tok.value == "[":
            raise _Refused('lists are created only in StoryInit, like <<set $inventory to ["rope", "torch"]>>')
        if tok.kind == "op" and tok.value in _BAD_CHARACTERS:  # { } :
            raise _Refused(_BAD_CHARACTERS[tok.value])
        raise _Refused(f"unexpected '{tok.value or 'end'}'")

    def story_variable(self, name: str) -> _Val:
        if name in _PARTY_VARIABLES:
            if self.scene.is_init:
                raise _Refused("StoryInit never contains character data - the server brings in the party")
            if name == "char":
                return _Val(PARTY, target=("party", name), who="$char")
            return _Val(CHAR, target=("party", name), who="$lead")
        if name.startswith("meta_") and name[len("meta_"):] in LEGEND_FIELDS:
            legend_name = name[len("meta_"):]
            raise _Refused(
                f"Legend belongs to each character - use $lead.{legend_name}, like <<set $lead.{legend_name} += 3>>"
            )
        return _Val(ANY, target=("story", name))

    def function(self, name: str) -> _Val:
        self.expect("op", "(", f"( after {name}")
        args = []
        if not self.at("op", ")"):
            while True:
                args.append(self.expression())
                if not self.at("op", ","):
                    break
                self.take()
        self.expect("op", ")", f") to close {name}(...)")
        if name == "visited":
            if len(args) != 1 or args[0].type != STR or args[0].literal is None:
                raise _Refused('visited() takes one scene name in quotes, like visited("Well")')
            self.scene.destinations.append((args[0].literal, False))
            return _Val(NUM)
        for arg in args:
            self.require_value(arg, f"in {name}()")
        if name == "random":
            if len(args) != 2:
                raise _Refused("random() takes the lowest and the highest number, like random(1, 6)")
            return _Val(NUM)
        if not args:
            raise _Refused('either() takes the values to pick from, like either("asleep", "awake")')
        return _Val(ANY)

    def postfix(self, value: _Val) -> _Val:
        while True:
            if self.at("op", "."):
                self.take()
                tok = self.take()
                if tok.kind != "word":
                    raise _Refused(f"expected a name after the dot (found '{tok.value or 'the end'}')")
                value = self.member(value, tok.value)
            elif self.at("op", "["):
                self.take()
                value = self.index(value)
                self.expect("op", "]", "] to close the brackets")
            elif self.at("op", "("):
                raise _Refused("only random(), either(), visited() and .includes() can be called")
            else:
                return value

    def member(self, value: _Val, name: str) -> _Val:
        if name in SYSTEM_MEMBERS:
            raise _Refused(_system_word(f".{name}"), BLOCK)
        if value.type == PARTY:
            if name == "length":
                return _Val(NUM)
            raise _Refused("$char has .length and the characters $char[0] to $char[3]")
        if value.type == CHAR:
            return self.character_field(value, name)
        if value.type == EQUIP and name == "includes":
            arg = self.call_argument("includes")
            if arg.type != STR or arg.literal is None:
                raise _Refused(f'equipment is checked with an item in quotes, like {value.who}.equipment.includes("rope")')
            if arg.literal not in EQUIPMENT_IDS:
                raise _Refused(
                    f'"{arg.literal}" isn\'t an item in the game - write an item\'s id, like "rope" (any rope) '
                    'or "pickaxe_2" (a pickaxe of tier 2 or better)'
                )
            return _Val(BOOL)
        if value.type == ANY and value.literal is None:
            if name == "length":
                return _Val(NUM)
            if name == "includes":
                arg = self.call_argument("includes")
                self.require_value(arg, "in .includes()")
                return _Val(BOOL)
            raise _Refused(f"'.{name}' isn't available - a story variable has .length and .includes(...)")
        raise _Refused(f"'.{name}' can't be used here")

    def call_argument(self, name: str) -> _Val:
        self.expect("op", "(", f"( after .{name}")
        arg = self.expression()
        self.expect("op", ")", f") to close .{name}(...) - it takes one value")
        return arg

    def character_field(self, value: _Val, name: str) -> _Val:
        who = value.who
        if name in NAME_FIELDS:
            return _Val(NAME, field=name, target=("character", name), who=who)
        if name in LIST_FIELDS:
            return _Val(ENUM, field=name, target=("character", name), who=who)
        if name in NUMBER_FIELDS:
            return _Val(NUM, field=name, target=("attribute", name), who=who)
        if name == EQUIPMENT_FIELD:
            return _Val(EQUIP, field=name, target=("character", name), who=who)
        if name in LEGEND_FIELDS:
            return _Val(NUM, field=name, target=("legend", name), who=who)
        raise _Refused(
            f"characters have no value '{name}' - for example might, mercy, firstName or equipment "
            "(see Characters in the story rules)"
        )

    def index(self, value: _Val) -> _Val:
        if value.type == PARTY:
            tok = self.take()
            if tok.kind == "num" and tok.value.isdigit() and int(tok.value) < PARTY_MAX:
                return _Val(CHAR, target=("party", tok.value), who=f"$char[{tok.value}]")
            if tok.kind == "tmp" and self.scene.loop_binds().get(tok.value) == "index":
                return _Val(CHAR, target=("party", tok.value), who=f"$char[{tok.value}]")
            raise _Refused("the characters are $char[0] to $char[3] - or go through them with <<for _i, _c range $char>>")
        if value.type == CHAR:
            tok = self.take()
            if tok.kind == "str":
                return self.character_field(value, tok.value[1:-1])
            raise _Refused(f'a character\'s value is named in quotes, like {value.who}["might"]')
        if value.type == ANY and value.literal is None:
            inner = self.expression()
            self.require_value(inner, "as a list position")
            return _Val(ANY)
        raise _Refused("[ ] can't be used here")


# ── Square-bracket markup: [[links]] and [img[...]] ──────────────────────────


@dataclass
class _Link:
    text: Optional[str]
    target: str
    setter: Optional[str]


def _link_parts(body: str) -> tuple:
    """(text or None, target) of a link body, split the way
    twine_graph._link_target finds the target."""
    if "|" in body:
        text, target = body.split("|", 1)
    elif "->" in body:
        text, target = body.split("->", 1)
    elif "<-" in body:
        target, text = body.split("<-", 1)
    else:
        return None, body.strip()
    return text.strip(), target.strip()


def _component_end(s: str, start: int, what: str) -> int:
    """Index of the ] that closes one [ ] component; refuses a line break or [."""
    end = s.find("]", start)
    if end < 0:
        raise _Refused(f"the {what} isn't closed with ]]")
    part = s[start:end]
    if "\n" in part:
        raise _Refused(f"a {what} stays on one line")
    if "[" in part:
        raise _Refused(f"a {what} can't contain [")
    return end


def _parse_link(s: str, i: int) -> tuple:
    """A [[link]] starting at s[i]: (_Link, index after it)."""
    end = _component_end(s, i + 2, "link")
    body = s[i + 2:end]
    setter = None
    if s.startswith("][", end):
        setter_end = _component_end(s, end + 2, "link")
        setter = s[end + 2:setter_end]
        end = setter_end
    if not s.startswith("]]", end):
        raise _Refused("a link is written [[Text|Scene]] or [[Text|Scene][$x to 1]]")
    text, target = _link_parts(body)
    return _Link(text, target, setter), end + 2


def _parse_image(s: str, i: int) -> tuple:
    """An [img[...]] starting at s[i]: (setter or None, index after it). The
    source and the link target are checked by auth_routes."""
    pos = _IMAGE_OPEN.match(s, i).end()
    end = _component_end(s, pos, "image")
    setter = None
    parts = 0
    while s.startswith("][", end):
        parts += 1
        if parts > 2:
            raise _Refused("an image is written [img[file]] or [img[file][Scene]]")
        part_end = _component_end(s, end + 2, "image")
        if parts == 2:
            setter = s[end + 2:part_end]
        end = part_end
    if not s.startswith("]]", end):
        raise _Refused("an image is written [img[file]] or [img[file][Scene]]")
    return setter, end + 2


# ── Macro arguments ──────────────────────────────────────────────────────────


def _macro_end(s: str, start: int) -> int:
    """Index of the >> that ends a macro tag, read like SugarCube's lexer:
    quotes and [ ] brackets are skipped. -1 when it isn't closed."""
    i, depth, n = start, 0, len(s)
    while i < n:
        ch = s[i]
        if ch in "\"'`":
            i += 1
            while i < n and s[i] != ch:
                i += 2 if s[i] == "\\" else 1
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth = max(0, depth - 1)
        elif ch == ">" and depth == 0 and s.startswith(">>", i):
            return i
        i += 1
    return -1


_ARGUMENT_WORD = re.compile(r"-?\d+(?:\.\d+)?(?![\w.])|[A-Za-z]+(?![\w$.])")


def _macro_arguments(raw: str) -> list:
    """The written-out arguments of a command: ("str", text), ("num", n),
    ("word", w) or ("link", _Link). Variables, backquotes and the like refused."""
    if "<!--" in raw:
        raise _Refused(_COMMENT_IN_COMMAND)
    out = []
    i, n = 0, len(raw)
    while i < n:
        ch = raw[i]
        if ch.isspace():
            i += 1
            continue
        if ch in "\"'":
            end = raw.find(ch, i + 1)
            if end < 0:
                raise _Refused("a quote isn't closed")
            out.append(("str", raw[i + 1:end]))
            i = end + 1
        elif raw.startswith("[[", i):
            link, i = _parse_link(raw, i)
            out.append(("link", link))
        elif ch == "`":
            raise _Refused("backquotes run program code - write the value out")
        elif ch in "$_":
            raise _Refused("write the value out here - a variable can't be used")
        else:
            m = _ARGUMENT_WORD.match(raw, i)
            if not m:
                raise _Refused(_BAD_CHARACTERS.get(ch, f"unexpected '{ch}'"))
            word = m.group(0)
            out.append(("word" if word[0].isalpha() else "num", word))
            i = m.end()
        if i < n and not raw[i].isspace():
            raise _Refused(f"unexpected '{raw[i]}' - separate the values with spaces")
    return out


def _literal_value(arg: tuple, what: str) -> None:
    """A choice's value: quoted text, a number, true or false."""
    kind, value = arg
    if kind == "str":
        _check_quoted(value)
    elif kind == "num" or (kind == "word" and value in ("true", "false")):
        pass
    else:
        raise _Refused(f'{what} is written out: quoted text, a number, true or false, like "north"')


# ── Random jumps ─────────────────────────────────────────────────────────────

# <<goto>> picks a scene at random only in these two shapes, in backquotes
# (SugarCube reads a macro argument as an expression only between backquotes;
# written plainly, `either("P1",` is taken as a scene name). Nothing but
# literal scene names and whole numbers stands inside, so every scene the
# jump can reach is known without running the story.
_GOTO_EITHER = re.compile(r'either\(\s*("[^"]*"(?:\s*,\s*"[^"]*")+)\s*\)')
_GOTO_RANGE = re.compile(r'"([^"]*)"\s*\+\s*random\(\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\)')
GOTO_RANGE_MAX = 200
_GOTO_FORMS = (
    '<<goto>> takes a scene name in quotes, like <<goto "Cave">>, or picks one at random in backquotes: '
    '<<goto `either("P1", "P7", "P8")`>> or <<goto `"P" + random(1, 30)`>>'
)


def _random_goto_targets(argument: str) -> list:
    """Every scene a backquoted random <<goto>> can reach, or _Refused."""
    if len(argument) < 2 or not argument.endswith("`") or "`" in argument[1:-1]:
        raise _Refused(_GOTO_FORMS)
    inner = argument[1:-1].strip()
    m = _GOTO_EITHER.fullmatch(inner)
    if m:
        names = re.findall(r'"([^"]*)"', m.group(1))
        for name in names:
            _check_quoted(name)
            if not name.strip():
                raise _Refused("either() lists scene names, never an empty one")
        if len(set(names)) != len(names):
            raise _Refused("either() lists each scene once - every scene listed is equally likely")
        return names
    m = _GOTO_RANGE.fullmatch(inner)
    if m:
        prefix, low, high = m.group(1), int(m.group(2)), int(m.group(3))
        _check_quoted(prefix)
        if low >= high:
            raise _Refused('random(low, high) needs a lower number first, like <<goto `"P" + random(1, 30)`>>')
        if high - low + 1 > GOTO_RANGE_MAX:
            raise _Refused(f"a random jump reaches at most {GOTO_RANGE_MAX} scenes")
        return [f"{prefix}{n}" for n in range(low, high + 1)]
    raise _Refused(_GOTO_FORMS)


# ── One scene ────────────────────────────────────────────────────────────────


class _Scene:
    """Reads one scene from start to end, the way SugarCube's wikifier finds
    its markup, and refuses what the rules don't describe."""

    def __init__(self, name: str, text: str):
        self.name = name
        self.text = text
        self.is_init = name == "StoryInit"
        self.errors: list = []
        self.frames: list = []
        self.legend: list = []
        self.endings: list = []  # the $isEnding values it sets, see check_target
        self.in_setter = False  # reading a link's [ ] part, which runs on the click
        self.ends = False  # sets $isEnding at all, also to a refused value
        self.teasers: Optional[dict] = None  # $meta_endings, StoryInit only
        self.destinations: list = []  # (scene, leads there)
        self.labels: set = set()  # visible choice texts so far, see choice_label
        self.open_label: Optional[dict] = None  # the <label> being read, see open_label_tag
        self._seen: set = set()

    # -- reporting --

    def line(self, pos: int) -> int:
        return self.text.count("\n", 0, pos) + 1

    def refuse(self, pos: int, message: str, kind: str = CODE) -> None:
        key = (self.line(pos), message)
        if key not in self._seen:
            self._seen.add(key)
            self.errors.append((key[0], message, kind))

    def findings(self) -> list:
        """(line, message, kind) in scene order. Every BLOCK is kept; the
        other findings up to _MAX_ERRORS_PER_SCENE, then a count of the rest."""
        kept, hidden = [], []
        others = 0
        for line, message, kind in self.errors:
            if kind != BLOCK:
                others += 1
                if others > _MAX_ERRORS_PER_SCENE:
                    hidden.append(kind)
                    continue
            kept.append((line, message, kind))
        if hidden:
            # Weighs what it stands for: the heaviest of the findings not shown.
            kind = next(k for k in (CODE, UNSUPPORTED, NOTE) if k in hidden)
            kept.append((None, f"{len(hidden)} more problems not shown", kind))
        return kept

    def messages(self) -> list:
        """Every finding as text, blocks and warnings alike (check_scene)."""
        return [
            f"Passage '{self.name}', line {line}: {message}" if line else f"Passage '{self.name}': {message}"
            for line, message, _ in self.findings()
        ]

    def scan_unread(self, start: int, end: int) -> None:
        """Look for the worst cases in a part the reading skips or couldn't
        finish (a refused command's arguments and body, a refused scene): it
        may hold anything, and these are refused wherever they are."""
        part = self.text[start:end]
        for pattern, message in _HARD_BLOCKS:
            for m in pattern.finditer(part):
                self.refuse(start + m.start(), message, BLOCK)
        for macro in _MACRO_ARGUMENTS_RE.finditer(part):
            words = _QUOTED_OR_LINK_RE.sub(lambda q: " " * len(q.group(0)), macro.group(1))
            offset = start + macro.start(1)
            for m in _SYSTEM_WORD_RE.finditer(words):
                self.refuse(offset + m.start(1), _system_word(m.group(1)), BLOCK)
            for m in _SYSTEM_MEMBER_RE.finditer(words):
                self.refuse(offset + m.start(), _system_word(f".{m.group(1)}"), BLOCK)

    def scan_css(self, start: int, end: int) -> None:
        """CSS in a scene (an @@ style, a style attribute) is a note, but
        what loads from outside or runs code in it is refused."""
        part = self.text[start:end]
        for pattern, message in _CSS_HARD_BLOCKS:
            for m in pattern.finditer(part):
                self.refuse(start + m.start(), message, BLOCK)

    # -- context --

    def top(self) -> Optional[dict]:
        return self.frames[-1] if self.frames else None

    def in_action(self) -> bool:
        return any(frame["kind"] in _ACTION_MACROS for frame in self.frames)

    def loop_binds(self) -> dict:
        binds: dict = {}
        for frame in self.frames:
            binds.update(frame.get("binds", {}))
        return binds

    def content_allowed(self, pos: int) -> bool:
        """Text, links, images, HTML and printed values belong in the scene,
        not between a button's tags, in a list of options or before a case."""
        top = self.top()
        if self.in_action():
            self.refuse(
                pos,
                "only <<set>>, <<if>> and <<goto>> go between a button's or link's tags, "
                "like <<button [[Rest|Camp]]>><<set $water -= 1>><</button>>",
                UNSUPPORTED,
            )
            return False
        if top and top["kind"] in _CHOICE_LISTS:
            self.refuse(pos, f"only <<option>> goes inside <<{top['kind']}>>", UNSUPPORTED)
            return False
        if top and top["kind"] == "switch" and top["head"]:
            self.refuse(pos, "only <<case>> and <<default>> go directly inside <<switch>>", UNSUPPORTED)
            return False
        return True

    # -- the scan --

    def check(self) -> None:
        text, pos, n = self.text, 0, len(self.text)
        while pos < n:
            m = _MARKUP_START.search(text, pos)
            start = m.start() if m else n
            if text[pos:start].strip():
                self.content_allowed(pos + (len(text[pos:start]) - len(text[pos:start].lstrip())))
            if self.open_label is not None:
                self.open_label["text"].append(text[pos:start])
            if not m:
                break
            self.inside_label(start)
            pos = self.markup(start)
        if self.open_label is not None:
            self.refuse(self.open_label["pos"], "<label> is never closed with </label>", UNSUPPORTED)
        for frame in reversed(self.frames):
            self.refuse(frame["pos"], f"<<{frame['kind']}>> is never closed with <</{frame['kind']}>>", UNSUPPORTED)

    def inside_label(self, i: int) -> None:
        """Inside a <label> only its text and one radio button or checkbox:
        the text is what the player's pick comes back as."""
        label = self.open_label
        if label is None or label["refused"] or _LABEL_CONTENT.match(self.text, i):
            return
        label["refused"] = True
        self.refuse(
            i,
            "a <label> holds only its text and one radio button or checkbox, "
            'like <label><<radiobutton "$path" "north">> North</label>',
            UNSUPPORTED,
        )

    def markup(self, i: int) -> int:
        text = self.text
        if text.startswith("<!--", i):
            m = _HTML_COMMENT.match(text, i)
            if not m:
                # No comment for SugarCube either: what follows is markup.
                if "-->" in text[i + 4:]:
                    self.refuse(i, "this comment crosses a Windows line break (\\r), so SugarCube doesn't read it as a comment - keep it on one line", NOTE)
                else:
                    self.refuse(i, "a comment is closed with -->, like <!-- a note -->", NOTE)
                return i + 4
            return m.end()
        if text.startswith("<<", i):
            return self.macro(i)
        if text.startswith("[[", i):
            return self.link(i)
        if _IMAGE_OPEN.match(text, i):
            return self.image(i)
        if text.startswith('"""', i) or text[i:i + 8].lower() == "<nowiki>":
            return self.verbatim(i)
        if text.startswith("$$", i):
            self.content_allowed(i)
            return i + 2
        if text[i] in "$_":
            return self.naked_variable(i)
        if text.startswith("@@", i):
            self.refuse(i, "@@ styles aren't accepted - give the text a class, like <span class=\"red\">, and style it in the story stylesheet", NOTE)
            close = text.find("@@", i + 2)
            self.scan_css(i, close if close >= 0 else len(text))
            return i + 2
        if text.startswith("/*", i) or text.startswith("/%", i):
            m = _BLOCK_COMMENT.match(text, i)
            if not m:
                return i + 2  # no comment for SugarCube: plain text
            self.refuse(i, "comments are written <!-- like this -->", NOTE)
            return m.end()
        url = _URL_RE.match(text, i)
        if url:
            if self.content_allowed(i):
                self.refuse(i, _WEB_ADDRESS, BLOCK)
            return url.end()
        return self.html_tag(i)

    def verbatim(self, i: int) -> int:
        """\"\"\"<<link>>\"\"\" shows the text as written (SugarCube puts it in a
        text node), so what's inside is never a command. Without its closing
        marks it is plain text."""
        self.content_allowed(i)
        m = _VERBATIM.match(self.text, i)
        if m:
            return m.end()
        return i + (3 if self.text.startswith('"""', i) else len("<nowiki>"))

    def naked_variable(self, i: int) -> int:
        m = _NAKED_VARIABLE.match(self.text, i)
        end = m.end() if m else i + 1
        if self.content_allowed(i):
            try:
                _Expression(self.text[i:end], self).printable()
            except _Refused as ex:
                self.refuse(i, str(ex), ex.kind)
        return end

    def link(self, i: int) -> int:
        try:
            link, end = _parse_link(self.text, i)
        except _Refused as ex:
            self.refuse(i, str(ex), ex.kind)
            return i + 2
        if self.content_allowed(i):
            self.check_link(i, link)
        return end

    def check_link(self, pos: int, link: _Link) -> None:
        if link.target[:1] in ("$", "_"):
            self.refuse(pos, "a link leads to a scene written out, never a variable, like [[Go north|North]]")
        if link.text is not None:
            problem = plain_text_problem(link.text)
            if problem:
                self.refuse(pos, f"{problem}, like [[Go north|North]]")
        self.choice_label(pos, link.text if link.text is not None else link.target)
        if link.setter is not None:
            self.setter(pos, link.setter)

    def setter(self, pos: int, source: str) -> None:
        self.in_setter = True
        try:
            _Expression(source, self).assignments()
        except _Refused as ex:
            self.refuse(pos, f"{ex} (in the link's [ ] part, like [[Drink|Well][$water to 3]])", ex.kind)
        finally:
            self.in_setter = False

    def image(self, i: int) -> int:
        try:
            setter, end = _parse_image(self.text, i)
        except _Refused as ex:
            self.refuse(i, str(ex), ex.kind)
            return i + 2
        if self.content_allowed(i) and setter is not None:
            self.setter(i, setter)
        return end

    def html_tag(self, i: int) -> int:
        m = _HTML_TAG.match(self.text, i)
        if not m:
            if self.content_allowed(i):
                self.refuse(i, "this < starts an HTML tag that isn't complete - write &lt; for a plain <", NOTE)
            return i + 1
        closing, name, attributes, _ = m.groups()
        tag = name.lower()
        if not self.content_allowed(i) or tag in _MEDIA_TAGS:
            return m.end()
        if tag not in ALLOWED_HTML_TAGS:
            self.refuse(i, *self.tag_message(tag))
            for attr in _HTML_ATTRIBUTE.finditer(attributes):
                self.attribute(i, tag, attr.group(1), attr.group(2), only_worst=True)
            return m.end()
        if closing and attributes.strip():
            self.refuse(i, f"</{tag}> takes no attributes", NOTE)
        for attr in _HTML_ATTRIBUTE.finditer(attributes):
            self.attribute(i, tag, attr.group(1), attr.group(2))
        if tag == "label":
            if closing:
                self.close_label_tag(i)
            else:
                self.open_label_tag(i)
        return m.end()

    def open_label_tag(self, i: int) -> None:
        if self.open_label is not None:
            self.refuse(i, "a <label> doesn't go inside another <label>", UNSUPPORTED)
            return
        self.open_label = {"pos": i, "text": [], "inputs": 0, "frame": self.top(), "refused": False}

    def close_label_tag(self, i: int) -> None:
        """A radio button's or checkbox's text is its <label>'s text: the
        player's pick comes back as it, so it counts like a link's text."""
        label, self.open_label = self.open_label, None
        if label is None:
            self.refuse(i, "</label> closes nothing - there is no open <label>", UNSUPPORTED)
            return
        if label["frame"] is not self.top():
            self.refuse(label["pos"], "a <label> opens and closes in the same part of the scene, not across <<if>> or <<switch>>", UNSUPPORTED)
            return
        if label["inputs"] != 1 or label["refused"]:
            return  # a plain label, or already refused
        shown = " ".join("".join(label["text"]).split())
        if not shown:
            self.refuse(
                label["pos"],
                'a radio button or checkbox needs its own text in the <label>, like <label><<radiobutton "$path" "north">> North</label>',
                UNSUPPORTED,
            )
            return
        problem = plain_text_problem(shown)
        if problem:
            self.refuse(label["pos"], f'{problem}, like <label><<radiobutton "$path" "north">> North</label>')
            return
        self.choice_label(label["pos"], shown)

    @staticmethod
    def tag_message(tag: str) -> tuple:
        """(message, kind) for an HTML tag outside ALLOWED_HTML_TAGS."""
        if tag == "script":
            return _JS_PLACE, BLOCK
        if tag == "style":
            return _CSS_PLACE, BLOCK
        if tag in _OUTSIDE_TAGS:
            return f"<{tag}> isn't accepted - {_OUTSIDE}", BLOCK
        if tag in ("input", "textarea", "select", "button", "option"):
            return f"<{tag}> isn't accepted - use <<button>>, <<link>> or the choice commands", UNSUPPORTED
        allowed = ", ".join(sorted(ALLOWED_HTML_TAGS))
        return f"<{tag}> isn't accepted - the HTML tags are {allowed}", NOTE

    def attribute(self, pos: int, tag: str, name: str, value: Optional[str], only_worst: bool = False) -> None:
        """One attribute: code in it or a way out of the story is refused
        (BLOCK); a style attribute is a note unless its CSS reaches outside;
        anything but class is a warning. `only_worst` for a tag already
        refused: just the worst cases."""
        attr = name.lower()
        if attr in _MEDIA_ATTRIBUTES:
            return
        if attr.startswith("on") or attr.startswith("@") or attr.startswith("sc-eval:"):
            self.refuse(pos, f"the {name} attribute: {_JS_PLACE}", BLOCK)
            return
        if attr in _OUTSIDE_ATTRIBUTES:
            self.refuse(pos, f"the {name} attribute isn't accepted - {_OUTSIDE}", BLOCK)
            return
        if value is not None and _URL_RE.search(value):
            self.refuse(pos, _WEB_ADDRESS, BLOCK)
            return
        if value is not None and ("<<" in value or "[[" in value or ">>" in value):
            # No nesting inside tags: the reading doesn't go into a value.
            self.refuse(pos, "a command or link doesn't go inside an HTML tag - put it between the opening and the closing tag")
            start = self.text.find(value, pos)
            if start >= 0:
                self.scan_unread(start, start + len(value))
            return
        if attr == "style":
            if value is not None:
                start = self.text.find(value, pos)
                if start >= 0:
                    self.scan_css(start, start + len(value))
            if not only_worst:
                self.refuse(pos, "the style attribute isn't accepted - give it a class and style that in the story stylesheet", NOTE)
            return
        if only_worst:
            return
        if attr in ("class", "id") and value is not None:
            names = value[1:-1] if value[:1] in "\"'" else value
            platform = PLATFORM_CLASS_RE if attr == "class" else PLATFORM_ID_RE
            taken = [n for n in names.split() if platform.fullmatch(n)]
            if taken:
                self.refuse(pos, f"{attr}=\"{taken[0]}\" is the platform's - {PLATFORM_HTML}", BLOCK)
                return
        if attr != "class":
            if attr.startswith("data-"):
                # data-passage and data-setter make SugarCube links and run code.
                self.refuse(pos, f"the {name} attribute isn't accepted - use [[Text|Scene]] for a way out")
            else:
                self.refuse(pos, f"the {name} attribute isn't accepted - <{tag}> takes only class", NOTE)
            return
        if value is None:
            self.refuse(pos, f'class needs a value, like <{tag} class="row">', NOTE)
            return
        if value[:1] in "\"'":
            value = value[1:-1]
        if not _CLASS_VALUE_RE.fullmatch(value):
            self.refuse(pos, "a class is letters, digits, - and _, like class=\"row\"", NOTE)

    # -- commands --

    def macro(self, i: int) -> int:
        text = self.text
        m = _MACRO_NAME.match(text, i + 2)
        end = _macro_end(text, i + 2)
        if end < 0:
            # The rest of the scene is one unfinished command: never read.
            self.refuse(i, "this << isn't closed with >>")
            self.scan_unread(i, len(text))
            return len(text)
        if not m or m.end() > end:
            self.refuse(i, "<< starts a command, like <<set $gold to 5>> - write &lt;&lt; for plain <<", UNSUPPORTED)
            self.scan_unread(i, end + 2)
            return end + 2
        closing, name = m.group(1) == "/", m.group(2)
        raw = text[m.end():end]
        if closing:
            if raw.strip():
                self.refuse(i, f"<</{name}>> takes nothing else", NOTE)
            self.close(i, name)
            return end + 2
        depth = len(self.frames)
        try:
            self.command(i, name, raw)
        except _Refused as ex:
            self.refuse(i, f"<<{name}>>: {ex}", ex.kind)
            if ex.kind != BLOCK:
                # Its arguments weren't read to the end: they may hold anything.
                self.scan_unread(i, end + 2)
            if name in _CONTAINERS and len(self.frames) == depth:
                # Refused before it opened: still opened, so its closing tag
                # matches and doesn't add a second error.
                self.open(i, name, else_seen=False, head=False, cases=1, default=False, field=None)
        if name in _REFUSED_MACROS and name in _REFUSED_CONTAINERS:
            closing_tag = text.find(f"<</{name}>>", end + 2)
            if closing_tag >= 0:
                # The body isn't read (it would add a page of follow-on
                # findings), only looked through for the worst cases.
                self.scan_unread(end + 2, closing_tag)
                return closing_tag + len(f"<</{name}>>")
        return end + 2

    def close(self, pos: int, name: str) -> None:
        top = self.top()
        if top and top["kind"] == name:
            if name == "switch" and not top["cases"]:
                self.refuse(top["pos"], "<<switch>> needs at least one <<case>>", NOTE)
            self.frames.pop()
            return
        if name in _REFUSED_MACROS:
            return  # the opening was refused already
        if any(frame["kind"] == name for frame in self.frames):
            self.refuse(pos, f"<</{name}>> comes before <</{top['kind']}>> is closed", UNSUPPORTED)
        else:
            self.refuse(pos, f"<</{name}>> closes nothing - there is no open <<{name}>>", UNSUPPORTED)

    def command(self, pos: int, name: str, raw: str) -> None:
        if name == "unset" and _PLATFORM_VALUE_RE.search(raw):
            raise _Refused(
                "the platform's values ($isEnding, $follows, $meta_..., $char, $lead) are never removed", BLOCK
            )
        if name in _REFUSED_MACROS:
            raise _Refused(*_REFUSED_MACROS[name])
        known = name in _HANDLERS
        if not known:
            # A widget, a macro from the Story JavaScript or a typo: unread.
            raise _Refused("isn't one of the story commands - see Accepted forms in the story rules")
        top = self.top()
        if self.in_action() and name not in ("set", "if", "elseif", "else", "goto"):
            raise _Refused(
                "only <<set>>, <<if>> and <<goto>> go between a button's or link's tags, "
                "like <<button [[Rest|Camp]]>><<set $water -= 1>><</button>>",
                UNSUPPORTED,
            )
        if top and top["kind"] in _CHOICE_LISTS and name not in ("option", "optionsfrom"):
            raise _Refused(f"only <<option>> goes inside <<{top['kind']}>>", UNSUPPORTED)
        if top and top["kind"] == "switch" and top["head"] and name not in ("case", "default"):
            raise _Refused("only <<case>> and <<default>> go directly inside <<switch>>", UNSUPPORTED)
        if self.is_init and name not in _INIT_MACROS:
            raise _Refused("StoryInit only sets up the story's values - use <<set>> (and <<if>>)", UNSUPPORTED)
        _HANDLERS[name](self, pos, raw)

    def open(self, pos: int, kind: str, **extra) -> None:
        self.frames.append({"kind": kind, "pos": pos, **extra})

    # -- choice texts --

    def choice_label(self, pos: int, label: str) -> None:
        """A text the player can pick: a link's or button's text, a radio
        button's or checkbox's label, an option. The player's click or pick
        comes back as this text (the engine never sends where a choice leads
        or what it stores), so every such text appears once in a scene's
        source - also across the branches of an <<if>> or <<switch>>, so a
        text always names one choice and the server knows what it does
        without running the scene. Inside <<for>> a choice would be shown
        once per character."""
        if any(f["kind"] == "for" for f in self.frames):
            self.refuse(
                pos,
                "choices (links, buttons, radio buttons, checkboxes, options) don't go inside <<for>> - "
                "it shows them once per character, so the scene would offer the same choice several times",
                UNSUPPORTED,
            )
            return
        key = " ".join(label.split()).casefold()
        if key in self.labels:
            self.refuse(
                pos,
                f"the choice '{' '.join(label.split())}' is in this scene twice - every link, button, "
                "radio button, checkbox and option needs its own text, also in different branches of "
                "an <<if>> (the player's choice comes back as its text)",
                UNSUPPORTED,
            )
        self.labels.add(key)

    def cmd_set(self, pos: int, raw: str) -> None:
        _Expression(raw, self).assignments()

    def cmd_if(self, pos: int, raw: str) -> None:
        self.open(pos, "if", else_seen=False)
        _Expression(raw, self).condition()

    def cmd_elseif(self, pos: int, raw: str) -> None:
        top = self.top()
        if not top or top["kind"] != "if":
            raise _Refused("<<elseif>> goes inside <<if>> ... <</if>>", UNSUPPORTED)
        if top["else_seen"]:
            raise _Refused("<<elseif>> comes before <<else>>", UNSUPPORTED)
        _Expression(raw, self).condition()

    def cmd_else(self, pos: int, raw: str) -> None:
        top = self.top()
        if not top or top["kind"] != "if":
            raise _Refused("<<else>> goes inside <<if>> ... <</if>>", UNSUPPORTED)
        if raw.strip():
            raise _Refused("write <<elseif condition>> for another condition")
        if top["else_seen"]:
            raise _Refused("an <<if>> has one <<else>>", UNSUPPORTED)
        top["else_seen"] = True

    def cmd_switch(self, pos: int, raw: str) -> None:
        self.open(pos, "switch", head=True, cases=0, default=False, field=None)
        self.top()["field"] = _Expression(raw, self).switch_value()

    def cmd_case(self, pos: int, raw: str) -> None:
        top = self.top()
        if not top or top["kind"] != "switch":
            raise _Refused("<<case>> goes inside <<switch>> ... <</switch>>", UNSUPPORTED)
        top["head"] = False
        top["cases"] += 1
        if top["default"]:
            raise _Refused("<<case>> comes before <<default>>", UNSUPPORTED)
        args = _macro_arguments(raw)
        if not args:
            raise _Refused('<<case>> takes the values to match, like <<case "asleep">>')
        values = list_values(top["field"]) if top["field"] else None
        for arg in args:
            _literal_value(arg, "a case")
            if top["field"]:
                if arg[0] != "str":
                    raise _Refused(f'a {top["field"]} is matched with a quoted value, like <<case "{_Expression.example_value(top["field"])}">>')
                if values is not None and arg[1] not in values:
                    raise _Refused(f'"{arg[1]}" isn\'t a {top["field"]} in the game')

    def cmd_default(self, pos: int, raw: str) -> None:
        top = self.top()
        if not top or top["kind"] != "switch":
            raise _Refused("<<default>> goes inside <<switch>> ... <</switch>>", UNSUPPORTED)
        if raw.strip():
            raise _Refused("<<default>> takes nothing else", NOTE)
        if top["default"]:
            raise _Refused("a <<switch>> has one <<default>>", UNSUPPORTED)
        top["head"] = False
        top["default"] = True

    def cmd_for(self, pos: int, raw: str) -> None:
        m = _FOR_RE.fullmatch(raw)
        if not m:
            raise _Refused("the only loop goes through the party: <<for _i, _c range $char>> ... <</for>>")
        index, value = m.groups()
        if index == value:
            raise _Refused("use two different names, like <<for _i, _c range $char>>")
        binds = {value: "char"}
        if index:
            binds[index] = "index"
        self.open(pos, "for", binds=binds)

    def cmd_print(self, pos: int, raw: str) -> None:
        if not raw.strip():
            raise _Refused("<<print>> needs a value, like <<print $gold>>", NOTE)
        if not self.content_allowed(pos):
            return
        _Expression(raw, self).printable()

    def cmd_link(self, pos: int, raw: str, kind: str = "link") -> None:
        self.open(pos, kind)
        args = _macro_arguments(raw)
        example = f"<<{kind} [[Rest|Camp]]>><</{kind}>>"
        if len(args) == 1 and args[0][0] == "link":
            link = args[0][1]
            if link.setter is not None:
                raise _Refused(f"put changes between the tags, like <<{kind} [[Rest|Camp]]>><<set $water -= 1>><</{kind}>>")
            if link.text is not None:
                problem = plain_text_problem(link.text)
                if problem:
                    raise _Refused(f"{problem}, like {example}")
            self.choice_label(pos, link.text if link.text is not None else link.target)
            return
        if 1 <= len(args) <= 2 and all(kind_ == "str" for kind_, _ in args):
            problem = plain_text_problem(args[0][1])
            if problem:
                raise _Refused(f"{problem}, like {example}")
            self.choice_label(pos, args[0][1])
            if len(args) == 2:
                _check_quoted(args[1][1])
                self.destinations.append((args[1][1], True))
            return
        raise _Refused(f"write where it leads as a link inside it, like {example}")

    def cmd_button(self, pos: int, raw: str) -> None:
        self.cmd_link(pos, raw, kind="button")

    def cmd_goto(self, pos: int, raw: str) -> None:
        if not self.in_action():
            raise _Refused(
                "a scene never jumps on its own - use a link, or <<goto>> between a button's tags, "
                'like <<button "Go">><<goto "Cave">><</button>>',
                UNSUPPORTED,
            )
        if raw.strip().startswith("`"):
            for target in _random_goto_targets(raw.strip()):
                self.destinations.append((target, True))
            return
        if re.search(r"\b(?:either|random)\s*\(", raw):
            raise _Refused(
                "without backquotes SugarCube reads a random pick as a scene name and never jumps - "
                'write <<goto `either("P1", "P7", "P8")`>> or <<goto `"P" + random(1, 30)`>>'
            )
        args = _macro_arguments(raw)
        if len(args) != 1 or args[0][0] != "str":
            raise _Refused(_GOTO_FORMS)
        _check_quoted(args[0][1])
        self.destinations.append((args[0][1], True))

    def cmd_area(self, pos: int, raw: str) -> None:
        if not self.content_allowed(pos):
            return
        args = _macro_arguments(raw)
        if len(args) != 5 or any(kind != "num" for kind, _ in args[:4]) or args[4][0] != "link":
            raise _Refused("write x y width height and a link, like <<area 0.10 0.20 0.30 0.40 [[Gate]]>>")
        link = args[4][1]
        if link.setter is not None:
            raise _Refused("a hotspot's link has no [ ] part")
        if link.text is not None:
            problem = plain_text_problem(link.text)
            if problem:
                raise _Refused(f"{problem}, like <<area 0.10 0.20 0.30 0.40 [[Open the gate->Gate]]>>")

    def choice_variable(self, arg: tuple, example: str) -> None:
        kind, value = arg
        m = _CHOICE_VARIABLE_RE.fullmatch(value) if kind == "str" else None
        if not m:
            raise _Refused(f'a choice stores into a story variable named in quotes, like {example}')
        name = m.group(1)
        if name in _PARTY_VARIABLES or name in (_ENDING_VARIABLE, _FOLLOWS_VARIABLE) or name.startswith("meta_"):
            raise _Refused(f"${name} belongs to the platform - store the choice in your own variable, like {example}", BLOCK)

    def choice_keywords(self, args: list, allowed: tuple, example: str) -> None:
        for kind, value in args:
            if kind != "word" or value not in allowed:
                raise _Refused(f"unexpected {value!r} - write it like {example}")

    def cmd_radiobutton(self, pos: int, raw: str) -> None:
        example = '<<radiobutton "$path" "north">>'
        if not self.content_allowed(pos):
            return
        self.input_in_label(pos, "radio button")
        args = _macro_arguments(raw)
        if len(args) < 2:
            raise _Refused(f"write the variable and the value, like {example}", UNSUPPORTED)
        self.choice_variable(args[0], example)
        _literal_value(args[1], "the value")
        self.choice_keywords(args[2:], ("checked", "autocheck"), example)

    def input_in_label(self, pos: int, kind: str) -> None:
        label = self.open_label
        if label is None:
            self.refuse(
                pos,
                f"a {kind} sits inside a <label> with its own text (the player's pick comes back as it), "
                'like <label><<radiobutton "$path" "north">> North</label>',
                UNSUPPORTED,
            )
            return
        label["inputs"] += 1
        if label["inputs"] == 2:
            self.refuse(pos, "one radio button or checkbox per <label>", UNSUPPORTED)

    def cmd_checkbox(self, pos: int, raw: str) -> None:
        example = '<<checkbox "$careful" false true>>'
        if not self.content_allowed(pos):
            return
        self.input_in_label(pos, "checkbox")
        args = _macro_arguments(raw)
        if len(args) < 3:
            raise _Refused(f"write the variable, the unchecked and the checked value, like {example}", UNSUPPORTED)
        self.choice_variable(args[0], example)
        _literal_value(args[1], "the unchecked value")
        _literal_value(args[2], "the checked value")
        self.choice_keywords(args[3:], ("checked", "autocheck"), example)

    def cmd_listbox(self, pos: int, raw: str, kind: str = "listbox") -> None:
        example = f'<<{kind} "$weapon">><<option "Sword" "sword">><</{kind}>>'
        allowed = self.content_allowed(pos)
        self.open(pos, kind)
        if not allowed:
            return
        args = _macro_arguments(raw)
        if not args:
            raise _Refused(f"write the variable it stores into, like {example}", UNSUPPORTED)
        self.choice_variable(args[0], example)
        self.choice_keywords(args[1:], ("autoselect",), example)

    def cmd_cycle(self, pos: int, raw: str) -> None:
        self.cmd_listbox(pos, raw, kind="cycle")

    def cmd_option(self, pos: int, raw: str) -> None:
        top = self.top()
        if not top or top["kind"] not in _CHOICE_LISTS:
            raise _Refused("<<option>> goes inside <<listbox>> or <<cycle>>", UNSUPPORTED)
        args = _macro_arguments(raw)
        if not args or args[0][0] != "str":
            raise _Refused('write the option\'s text in quotes, like <<option "Sword" "sword">>')
        _check_quoted(args[0][1])
        self.choice_label(pos, args[0][1])
        rest = args[1:]
        if rest and not (rest[0][0] == "word" and rest[0][1] == "selected"):
            _literal_value(rest[0], "the option's value")
            rest = rest[1:]
        self.choice_keywords(rest, ("selected",), '<<option "Sword" "sword" selected>>')

    def cmd_optionsfrom(self, pos: int, raw: str) -> None:
        """Refused: its option texts come from a variable while the story is
        played, so the check can't read them - not whether they're plain
        words, nor whether one repeats another choice's text."""
        raise _Refused(
            '<<optionsfrom>> isn\'t accepted - write each option with <<option "Rope" "rope">>, so every '
            "option's text is in the scene; for options that change during the story, put radio buttons inside <<if>>"
        )

    def cmd_nobr(self, pos: int, raw: str) -> None:
        if raw.strip():
            raise _Refused("<<nobr>> takes nothing else", NOTE)
        self.open(pos, "nobr")


_HANDLERS = {
    "set": _Scene.cmd_set, "if": _Scene.cmd_if, "elseif": _Scene.cmd_elseif, "else": _Scene.cmd_else,
    "switch": _Scene.cmd_switch, "case": _Scene.cmd_case, "default": _Scene.cmd_default,
    "for": _Scene.cmd_for, "print": _Scene.cmd_print, "link": _Scene.cmd_link,
    "button": _Scene.cmd_button, "goto": _Scene.cmd_goto, "area": _Scene.cmd_area,
    "radiobutton": _Scene.cmd_radiobutton, "checkbox": _Scene.cmd_checkbox,
    "listbox": _Scene.cmd_listbox, "cycle": _Scene.cmd_cycle, "option": _Scene.cmd_option,
    "optionsfrom": _Scene.cmd_optionsfrom, "nobr": _Scene.cmd_nobr,
}


# ── Stylesheet ───────────────────────────────────────────────────────────────

# The parts of the page that are the platform's (docs/STORY-RULES.md
# "Stylesheet"): never styled by a story. The scene itself (.passage,
# #passages, #story) may be styled - a text inset, say: the platform's buttons
# are drawn outside the sealed frame the scene is shown in, where story CSS
# can't reach (ARCHITECTURE.md "What the player receives").
PLATFORM_CSS = (
    "this is the platform's part of the page (the clickable image areas .wud-..., the error box "
    ".error-view, SugarCube's side bar #ui-..., or a selector by data-passage, data-tags, class or id) - "
    "style your own classes, or .passage for the whole scene"
)
# In a scene's HTML: the engine finds the scene, its clickable image areas and
# SugarCube's error box by these names (error-view: the engine drops what is
# inside it from the player's scene and treats its text as a story error).
PLATFORM_HTML = (
    "the engine finds the scene, its clickable image areas and its error box by these names - "
    "give your element your own, like <div class=\"scene\">"
)
PLATFORM_CLASS_RE = re.compile(r"passage|wud-[\w-]*|error-view", re.I)
PLATFORM_ID_RE = re.compile(r"passages|story|ui-[\w-]*", re.I)

# url(...) and @import are reported by auth_routes._image_rule_errors.
_CSS_REFUSED = (
    (re.compile(r"@font-face", re.I), "@font-face loads fonts from outside the story"),
    (re.compile(r"@namespace|@document", re.I), "this @ rule isn't accepted"),
    (re.compile(r"expression\s*\(", re.I), f"expression(...) {_CODE}"),
    (re.compile(r"behavior\s*:", re.I), f"behavior {_CODE}"),
    (re.compile(r"-moz-binding", re.I), f"-moz-binding {_CODE}"),
    (re.compile(r"javascript\s*:", re.I), f"javascript: {_CODE}"),
    (re.compile(r"(?:image-set|\bimage|cross-fade|\belement)\s*\(", re.I),
     "image-set(), image(), cross-fade() and element() could load a picture from outside the story"),
    (re.compile(r"\\"), "backslash escapes aren't accepted - write the character itself"),
    (re.compile(r"<"), "< isn't accepted in a stylesheet"),
    # The platform's parts of the page: a story can't hide or move the
    # clickable image areas, the error box or SugarCube's side bar, nor reach
    # them by attribute ([class*=wud]).
    (re.compile(
        r"#ui-[\w-]*|\.wud-[\w-]*|\.error-view(?![\w-])"
        r"|\[\s*data-(?:passage|tags)\b|\[\s*(?:class|id)\b",
        re.I,
    ), PLATFORM_CSS),
)


def stylesheet_errors(label: str, css: str) -> list:
    """What a stylesheet may not hold (docs/STORY-RULES.md "Stylesheet")."""
    errors = []
    for pattern, message in _CSS_REFUSED:
        m = pattern.search(css or "")
        if m:
            line = css.count("\n", 0, m.start()) + 1
            errors.append(f"{label}, line {line}: {message}")
    return errors


# ── The whole story ──────────────────────────────────────────────────────────


def format_error(story_data: dict) -> Optional[str]:
    name = (story_data or {}).get("storyFormat") or ""
    version = (story_data or {}).get("storyFormatVersion") or ""
    if name == FORMAT_NAME and version == FORMAT_VERSION:
        return None
    shown = f"{name} {version}".strip() or "unknown"
    return (
        f"Story format is '{shown}' - only {FORMAT_NAME} {FORMAT_VERSION} is accepted "
        "(choose it under Story > Details)"
    )


def macro_exits(name: str, text: str) -> list:
    """The scenes a scene's commands can lead to besides its [[links]] and
    image links: a button's quoted destination (<<button "Go" "Cave">>),
    <<goto>> between a button's or link's tags, and every scene a random
    jump can reach. Read the way check_scene reads the scene; a refused
    command adds nothing, and visited("X") only reads. Used for the
    structure rules on submit and for the step graph
    (twine_graph.build_story_graph), so both know every way on."""
    return scene_outline(name, text)[0]


def scene_outline(name: str, text: str) -> tuple:
    """(ways on, endings) of one scene as the check reads it: the scenes its
    commands lead to (see macro_exits) and the $isEnding values it sets, in
    order. One reading for the step graph (twine_graph.build_story_graph)."""
    scene = _Scene(name, text)
    scene.check()
    exits: list = []
    for destination, leads in scene.destinations:
        if leads and destination not in exits:
            exits.append(destination)
    return exits, list(scene.endings)


def check_scene(name: str, text: str) -> list:
    """The refusals for one scene's text on its own (names of other scenes,
    the Legend focus and the structure rules aren't checked here)."""
    scene = _Scene(name, text)
    scene.check()
    return scene.messages()


# What a refused scene tag weighs: code or CSS in the wrong place and media
# scenes (their text is a file, maybe from outside) are refused; a widget scene
# isn't played yet; an init scene runs as code when the story starts.
_TAG_KINDS = {"script": BLOCK, "stylesheet": BLOCK, "init": CODE, "widget": UNSUPPORTED}


def _tag_kind(tag: str) -> str:
    return _TAG_KINDS.get(tag.lower(), BLOCK)


_SCRIPT_URL_RE = re.compile(r"\b(?:https?|wss?|ftp|file):\/\/", re.IGNORECASE)


def _blank_js(js: str, strings: bool) -> str:
    """The Story JavaScript with its comments (and, with `strings`, its quoted
    strings) blanked out, keeping every position and line break. Template
    strings stay: they can hold code. A rough reading, enough for the names
    script_blocks looks for."""
    out = list(js)
    i, n = 0, len(js)

    def blank(a: int, b: int) -> None:
        for k in range(a, b):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        if js.startswith("//", i):
            j = js.find("\n", i)
            j = n if j < 0 else j
            blank(i, j)
            i = j
            continue
        if js.startswith("/*", i):
            j = js.find("*/", i + 2)
            j = n if j < 0 else j + 2
            blank(i, j)
            i = j
            continue
        ch = js[i]
        if ch in "'\"`":
            j = i + 1
            while j < n and js[j] != ch and (ch == "`" or js[j] != "\n"):
                j += 2 if js[j] == "\\" else 1
            j = min(j + 1, n)
            if strings and ch != "`":
                blank(i, j)
            i = j
            continue
        i += 1
    return "".join(out)


def script_blocks(js: str) -> list:
    """The worst cases in the Story JavaScript, as "line N: message": the
    names that reconfigure SugarCube or reach the browser, Node or the
    network, and web addresses. A guard rail only - the story waits anyway
    while it has JavaScript."""
    code = _blank_js(js, strings=True)
    no_comments = _blank_js(js, strings=False)
    found: list = []
    for m in _SYSTEM_WORD_RE.finditer(code):
        found.append((m.start(1), _system_word(m.group(1))))
    for m in _SYSTEM_MEMBER_RE.finditer(code):
        found.append((m.start(), _system_word(f".{m.group(1)}")))
    for m in _SCRIPT_URL_RE.finditer(no_comments):
        found.append((m.start(), _WEB_ADDRESS))
    seen: set = set()
    out = []
    for pos, message in sorted(found):
        key = (js.count("\n", 0, pos) + 1, message)
        if key not in seen:
            seen.add(key)
            out.append(f"line {key[0]}: {message}")
    return out


def check_story(passages: list, story_data: dict) -> StoryCheck:
    """Apply the story rules to every scene, the special scenes and tags, the
    Story JavaScript, the stylesheet and the Legend focus: BLOCK findings go
    to `errors`, the others to `warnings`. TestCharacters is checked on its
    own (backend.test_characters)."""
    result = StoryCheck()
    names = {p.get("name", "") for p in passages}
    changes: list = []

    def add(name: str, findings: list) -> None:
        place = f"Passage '{name}'"
        for line, message, kind in findings:
            if kind == BLOCK:
                result.errors.append(f"{place}, line {line}: {message}" if line else f"{place}: {message}")
                continue
            result.warnings.append(finding(place, line, kind, message))
            if kind in HOLDING_KINDS:
                result.waiting.add(name)
            if kind == CODE:
                result.has_code = True

    for p in passages:
        name = p.get("name", "")
        text = p.get("text", "") or ""
        tags = [str(t) for t in (p.get("tags") or [])]
        lowered = {t.lower() for t in tags}
        if name == TEST_CHARACTERS_PASSAGE:
            continue
        refused_tags = sorted(t for t in tags if t.lower() in REFUSED_TAGS | REFUSED_MEDIA_TAGS)
        if name in REFUSED_PASSAGES or refused_tags:
            # Not read as a scene: only looked through for the worst cases.
            scene = _Scene(name, text)
            scene.scan_unread(0, len(text))
            add(name, scene.findings())
            if name in REFUSED_PASSAGES:
                add(name, [(None, "this special scene isn't played - StoryInit, Retreat and LastResort "
                                  "are the only special scenes", UNSUPPORTED)])
                continue
            kinds = [_tag_kind(t) for t in refused_tags]
            if BLOCK in kinds:
                hint = ""
                if "stylesheet" in lowered:
                    hint = " (styles go in the Story Stylesheet)"
                elif "script" in lowered:
                    hint = " (JavaScript goes in the Story JavaScript)"
                result.errors.append(
                    f"Passage '{name}' is tagged {', '.join(refused_tags)} - scenes with this tag aren't accepted{hint}"
                )
            else:
                kind = CODE if CODE in kinds else UNSUPPORTED
                add(name, [(None, f"is tagged {', '.join(refused_tags)} - scenes with this tag aren't played yet", kind)])
            continue
        scene = _Scene(name, text)
        scene.check()
        add(name, scene.findings())
        changes.extend(scene.legend)
        if scene.endings:
            result.endings[name] = list(scene.endings)
        if scene.ends:
            result.ending_scenes.add(name)
        if scene.is_init:
            result.teasers = scene.teasers
        missing = []
        for destination, leads in scene.destinations:
            if destination not in names:
                if destination not in missing:
                    missing.append(destination)
            elif leads and destination == LAST_RESORT_PASSAGE:
                result.errors.append(
                    f"Passage '{name}' leads to LastResort - the engine routes there on a fault; it is not a story destination"
                )
        if len(missing) <= 3:
            for destination in missing:
                result.errors.append(f"Passage '{name}' names the scene '{destination}', which does not exist")
        else:
            shown = ", ".join(f"'{d}'" for d in missing[:3])
            result.errors.append(
                f"Passage '{name}' names the scenes {shown} and {len(missing) - 3} more, which do not exist"
            )

    # The Story JavaScript: allowed to be handed in, but the story waits until
    # there are rules for JavaScript (it would run on the shared engine workers).
    script = (story_data or {}).get("script") or ""
    if script.strip():
        result.has_code = True
        result.warnings.append(finding(
            "Story JavaScript", None, CODE,
            "the story has its own JavaScript - it waits until there are rules for JavaScript, "
            "so expect a long review",
        ))
        result.errors.extend(f"Story JavaScript, {problem}" for problem in script_blocks(script))

    result.errors.extend(stylesheet_errors("Story Stylesheet", (story_data or {}).get("stylesheet") or ""))

    points: dict = {}
    for name, amount in changes:
        key = pair_key(name)
        points[key] = points.get(key, 0) + amount
    if len(points) > LEGEND_PAIRS_MAX:
        result.errors.append(
            f"The story changes {len(points)} Legend pairs ({', '.join(sorted(points))}) - "
            f"a story changes at most {LEGEND_PAIRS_MAX}"
        )
    result.legend_points = {key: min(LEGEND_POINTS_MAX, total) for key, total in sorted(points.items())}
    return result
