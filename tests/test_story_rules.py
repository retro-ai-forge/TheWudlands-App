"""The story check (backend/story_rules.py): docs/STORY-RULES.md applied to a
story's scenes without running anything.

The rules document is the specification: every "Accepted" example in it must
pass and every "Not accepted" line must be refused, so the two can't drift
apart. The rest covers what SugarCube would run as code - including a link's
text, which SugarCube 2.37.3 evaluates (Wikifier.helpers.evalText) - the
characters' values, the Legend focus, the stylesheet and the special scenes.
"""

import json
import re
from pathlib import Path

import pytest

from backend import story_rules
from backend.story_rules import check_scene, check_story, plain_text_problem
from backend.test_characters import read_party

RULES_DOC = (Path(__file__).resolve().parent.parent / "docs" / "STORY-RULES.md").read_text(encoding="utf-8")
_BLOCK = re.compile(r"^(#{2,4} [^\n]*)$|^```[^\n]*\n(.*?)^```$", re.M | re.S)


def _doc_blocks():
    """(heading, line before the block, block) for every code block in the rules."""
    heading = None
    for m in _BLOCK.finditer(RULES_DOC):
        if m.group(1):
            heading = m.group(1)
            continue
        before = RULES_DOC[: m.start()].rstrip().splitlines()[-1]
        yield heading, before, m.group(2)


def _accepted_blocks():
    for heading, before, block in _doc_blocks():
        if before == "Not accepted:" or heading == "### Test characters":
            continue
        name = "StoryInit" if heading == "### StoryInit" else "Scene"
        yield pytest.param(name, block, id=f"{heading} | {block.splitlines()[0][:40]}")


def _refused_lines():
    for heading, before, block in _doc_blocks():
        if before != "Not accepted:":
            continue
        for line in block.splitlines():
            code = re.split(r"\s{2,}\(", line)[0].strip()
            if code:
                yield pytest.param(code, id=code[:50])


@pytest.mark.parametrize("name, block", list(_accepted_blocks()))
def test_every_accepted_example_in_the_rules_passes(name, block):
    assert check_scene(name, block) == []


@pytest.mark.parametrize("line", list(_refused_lines()))
def test_every_not_accepted_example_in_the_rules_is_refused(line):
    assert check_scene("Scene", line), line


def test_the_rules_example_test_party_is_valid():
    block = next(b for h, _, b in _doc_blocks() if h == "### Test characters")
    party, errors = read_party(block, 4)
    assert errors == []
    assert [c["name"] for c in party] == ["Grimjaw Ironfoot", "Elara Moonwhisper"]


# --- program code -------------------------------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("<<script>>alert(1)<</script>>", "Story JavaScript"),
        ("<<run alert(1)>>", "Story JavaScript"),
        ("<script>alert(1)</script>", "Story JavaScript"),
        ('<span onclick="alert(1)">x</span>', "Story JavaScript"),
        ('<span @class="State.x">x</span>', "Story JavaScript"),
        ('<span sc-eval:class="x">x</span>', "Story JavaScript"),
        ('<span data-setter="$x to 1">x</span>', "data-setter"),
        ('<span style="color: red">x</span>', "style attribute"),
        ("<<set $x to `alert(1)`>>", "backquotes"),
        ("<<link `alert(1)`>><</link>>", "backquotes"),
        ("<<set $x to setup.x>>", "engine's internals"),
        ("<<print window.name>>", "engine's internals"),
        ("<<if Config.debug>>x<</if>>", "reaches into SugarCube"),
        ("<<set $x to (function(){})()>>", "{ }"),
        ("<<set $x to $x[0](1)>>", "can be called"),
        ("<<print $x.constructor>>", "reaches into SugarCube"),
        ("<<set $x to --$y>>", "--"),
        ("<<set $x to $y++>>", "++"),
        ("<<if $x = 5>>x<</if>>", "to compare, use is"),
        ("<<if ($x = 5)>>x<</if>>", "to compare, use is"),
        ("<<print $x = 5>>", "to compare, use is"),
        ("<<set $x to $y = 5>>", "to compare, use is"),
        ("[[Go|Cave][$x = 1; $y = 2]]", "; isn't accepted"),
        ("<<set $lead.mercy = 5>>", "only with += or -="),
        ("<<=$x>>", "use <<print>>"),
        ("@@color:red;x@@", "@@"),
        ("/* hidden */", "<!-- like this -->"),
        ("[[Go|X][alert(1)]]", "engine's internals"),
        ("[img[gate.webp][X][alert(1)]]", "engine's internals"),
        ("<<widget \"x\">>y<</widget>>", "widgets"),
        ("<<timed 2s>>x<</timed>>", "live browser"),
        ("<<textbox \"$name\" \"\">>", "never type"),
        ("<<goto \"Cave\">>", "never jumps on its own"),
        ("<<include \"Cave\">>", "link to it"),
    ],
)
def test_program_code_is_refused(text, expected):
    errors = check_scene("Scene", text)
    assert any(expected in e for e in errors), errors


@pytest.mark.parametrize(
    "link",
    [
        "[[alert(1)|Start]]",
        "[[new Engine.restart|Start]]",
        "[[delete State.variables.gold|Start]]",
        "[[$gold|Start]]",
        "[[_tmp|Start]]",
        "[[x = 1|Start]]",
        "[[gold--|Start]]",
        '[[Say "hi"|Start]]',
        "<<button [[alert(1)|Start]]>><</button>>",
        "<<link [[alert(1)|Start]]>><</link>>",
        "<<area 0.10 0.20 0.30 0.40 [[alert(1)->Start]]>>",
        '<<button "alert(1)" "Start">><</button>>',
    ],
)
def test_link_texts_are_plain_words_because_sugarcube_runs_them(link):
    # SugarCube evaluates a link's text as JavaScript before showing it.
    errors = check_scene("Scene", link)
    assert any("plain words" in e or "program code" in e or "--" in e for e in errors), errors


@pytest.mark.parametrize(
    "text",
    ["Go north", "Don't go!", "Wait… listen.", "Ask about the “red door”", "North-east", "Buy a new sword.", "Élan, ça va?"],
)
def test_ordinary_link_texts_pass(text):
    assert plain_text_problem(text) is None
    assert check_scene("Scene", f"[[{text}|Start]]") == []


def test_a_link_never_leads_to_a_variable():
    assert any("never a variable" in e for e in check_scene("Scene", "[[Go|$target]]"))


@pytest.mark.parametrize(
    "text",
    [
        "<<set $gold += 5>>",
        "<<set $gold -= 2>>",
        "<<set $gold += 1, $water -= 1>>",
        "<<set _roll += 2>>",
        "<<set $lead.mercy += 3>>",
        "<<set $lead.mercy -= 2>>",
        "<<for _i, _c range $char>><<set _c.courage -= 1>><</for>>",
        "[[Drink|Well][$water += 1]]",
        "[[Rest|Camp][$water -= 1, $gold += 2]]",
        "<<button [[Rest|Camp]]>><<set $water -= 1>><</button>>",
    ],
)
def test_changes_with_plus_and_minus_equals_pass(text):
    assert check_scene("Scene", text) == []


@pytest.mark.parametrize(
    "text, expected",
    [
        ("<<if $x = 0>>x<</if>>", "to compare, use is"),
        ("<<set $a to 1; $b to 2>>", "separate changes with a comma"),
        ("[[Go|X][$a to 1; $b to 2]]", "separate changes with a comma"),
        ("[[Go|X][<<set $a to 1>>]]", "unexpected '<'"),
        ("<<link [[Go|X]]>><<$a to 1, $b to 2>><</link>>",
         "set is missing: <<set $a to 1, $b to 2>>"),
    ],
)
def test_changes_are_separated_by_commas_and_equals_only_sets(text, expected):
    # A comma (not ;) between changes, no <<set>> in a link's [ ] part, and =
    # only to set a value (to and = are the same), never to compare.
    errors = check_scene("Scene", text)
    assert any(expected in e for e in errors), errors


# --- characters ---------------------------------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("<<set $x to $lead>>", "whole character"),
        ("<<print $lead>>", "whole character"),
        ("<<set $x to $lead.equipment>>", 'includes("item")'),
        ("<<if $lead.race>>x<</if>>", "compared with a quoted value"),
        ('<<if $lead.race is "orcish">>x<</if>>', "isn't a race in the game"),
        ('<<if $lead.equipment.includes("laser_9")>>x<</if>>', "isn't an item in the game"),
        ('<<if $lead.equipment.includes("rope_7")>>x<</if>>', "isn't an item in the game"),
        ('<<if $lead.equipment.includes("Rope")>>x<</if>>', "isn't an item in the game"),
        ('<<if $lead.equipment.includes("rope_")>>x<</if>>', "isn't an item in the game"),
        ('<<set $x to "a" + $lead.race>>', "printed or compared"),
        ('<<set $x to $lead["constructor"]>>', "no value 'constructor'"),
        ("<<set $x to $char[4].might>>", "$char[0] to $char[3]"),
        ("<<set $lead.mercy += 1.5>>", "whole number"),
        ("<<set $lead.mercy += $x>>", "whole number"),
        ("<<set $lead.firstName to 1>>", "only the characters' Legend"),
        ("<<set $char[0] to 1>>", "sets the party"),
        ("<<set _c.mercy += 1>>", "isn't available"),
        ("<<for _i, _c range $char>><<set _c to 1>><</for>>", "belongs to the <<for>> loop"),
        ("<<for _i, _c range $inventory>>x<</for>>", "only loop"),
        ('<<radiobutton "$lead" "x">>', "belongs to the platform"),
        ('<<radiobutton "$isEnding" true>>', "belongs to the platform"),
    ],
)
def test_character_values_are_used_only_as_the_rules_say(text, expected):
    errors = check_scene("Scene", text)
    assert any(expected in e for e in errors), errors


def test_equals_sets_a_value_like_to():
    """<<set $x = 5>> is the same as <<set $x to 5>>, in <<set>> and in a
    link's [ ] part; it is refused everywhere else (see the refusals above)."""
    for text in (
        "<<set $gold = 5>>",
        "<<set $a = 1, $b to 2>>",
        "<<set $name = 'Cave'>>",
        "[[Go|Cave][$gold = 5, $torch = 1]]",
        '<<link [[Go|Cave]]>><<set $gold = 5>><</link>>',
    ):
        assert check_scene("Scene", text) == [], text


@pytest.mark.parametrize(
    "text",
    [
        '<<switch $lead.race>><<case "dwarf">>Stout.<<case "elf" "halfelf">>Tall.<</switch>>',
        "<<if $char.length gte 2>>A party.<</if>>",
        "<<for _i, _c range $char>><<if $char[_i].might gt 5>>Strong.<</if>><</for>>",
        '<<if $lead["fame"] gte 30>>Known.<</if>>',
        '<<if $lead.prof1 is "blacksmith" or $lead.prof2 isnot "none">>x<</if>>',
    ],
)
def test_more_character_forms_pass(text):
    assert check_scene("Scene", text) == []


def test_equipment_is_checked_by_family_id_or_item_id():
    """A family id ("rope", any tier) and an item id ("rope_2", that tier or
    better) are both accepted for every item in the game; the engine lists
    both for each carried item, which only works while a family id can't be
    mistaken for an item id."""
    from backend.items_catalog import ITEM_CATALOG_ENTRIES, ITEM_FAMILIES_BY_ID

    for family_id in ITEM_FAMILIES_BY_ID:
        assert not re.search(r"_\d+$", family_id), family_id
        assert check_scene("Scene", f'<<if $lead.equipment.includes("{family_id}")>>x<</if>>') == [], family_id
    for entry in ITEM_CATALOG_ENTRIES:
        assert entry.id == f"{entry.family_id}_{entry.tier}", entry.id
        assert check_scene("Scene", f'<<if $lead.equipment.includes("{entry.id}")>>x<</if>>') == [], entry.id


def test_story_init_never_holds_character_data():
    assert any("character data" in e for e in check_scene("StoryInit", "<<set $x to $lead.might>>"))
    assert any("character data" in e for e in check_scene("StoryInit", "<<set $lead.mercy += 1>>"))
    assert any("only sets up" in e for e in check_scene("StoryInit", '<<button "Go" "Start">><</button>>'))


def test_lists_are_created_only_in_story_init():
    assert check_scene("StoryInit", '<<set $bag to ["rope", 2, true]>>') == []
    assert any("only in StoryInit" in e for e in check_scene("Scene", '<<set $bag to ["rope"]>>'))
    assert any("written-out values" in e for e in check_scene("StoryInit", "<<set $bag to [$x]>>"))


def test_meta_values_are_set_in_story_init():
    assert any("set in StoryInit" in e for e in check_scene("Scene", '<<set $meta_title to "x">>'))
    assert check_scene("Scene", "<<set $meta_allowRunAway to false>>") == []
    assert any("belongs to each character" in e for e in check_scene("StoryInit", "<<set $meta_mercy to 3>>"))


# --- structure of commands ------------------------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("<<if true>>", "never closed"),
        ("<</if>>", "closes nothing"),
        ("<<if true>>a<<else>>b<<else>>c<</if>>", "one <<else>>"),
        ("<<if true>>a<<else>>b<<elseif false>>c<</if>>", "before <<else>>"),
        ("<<link [[Go|Cave]]>>text<</link>>", "only <<set>>, <<if>> and <<goto>>"),
        ("<<link [[Go|Cave]]>><<print 1>><</link>>", "only <<set>>, <<if>> and <<goto>>"),
        ('<<listbox "$w">>text<</listbox>>', "only <<option>>"),
        ("<<switch $x>>text<<case 1>>a<</switch>>", "directly inside <<switch>>"),
        ("<<option \"a\">>", "goes inside <<listbox>>"),
        ("a <b c", "isn't complete"),
        ("<<set $x to 1", "isn't closed"),
        ("<em>x</em> <marquee>y</marquee>", "<marquee> isn't accepted"),
        ('<div class="a;b">x</div>', "a class is"),
    ],
)
def test_commands_and_tags_are_well_formed(text, expected):
    errors = check_scene("Scene", text)
    assert any(expected in e for e in errors), errors


def test_a_refusal_names_the_scene_and_the_line():
    errors = check_scene("Cave", "First line\nSecond <<run alert(1)>>")
    assert errors == ["Passage 'Cave', line 2: <<run>>: JavaScript goes in the Story JavaScript, not in a scene"]


def test_a_refused_script_body_adds_no_follow_on_errors():
    errors = check_scene("Scene", "<<script>>if (a < b) { $('x') }<</script>> [[Go|Start]]")
    assert len(errors) == 1 and "<<script>>" in errors[0]


def test_comments_and_entities_are_plain_text():
    assert check_scene("Scene", "A <!-- <<run alert(1)>> --> B &lt;&lt;run&gt;&gt; costs $5") == []


@pytest.mark.parametrize(
    "text",
    [
        'Write """<<link>>""" or """<<run alert(1)>>""" to show a command.',
        "<nowiki><<run alert(1)>></nowiki>",
        "A\n<!-- note\nacross lines -->\nB",
    ],
)
def test_verbatim_text_and_comments_are_never_read_as_markup(text):
    # SugarCube shows verbatim text as written and drops comments.
    assert check_scene("Scene", text) == []


@pytest.mark.parametrize(
    "text",
    [
        "You walk on. <!-- a note --> [[Go|Cave]]",
        "<!-- a note -->\nYou walk on.",
        "<<button [[Go|Cave]]>><!-- a note --><<set $x to 1>><</button>>",
        '<<listbox "$w">><!-- a note --><<option "Sword" "sword">><</listbox>>',
        "<<switch $x>><!-- a note --><<case 1>>a<</switch>>",
        "<!-- a note -->\r\nWindows line ends after a one-line comment",
    ],
)
def test_one_line_comments_go_anywhere_in_a_scene(text):
    assert check_scene("Scene", text) == []
    assert check_scene("StoryInit", "<!-- setup -->\n<<set $gold to 5>>") == []


@pytest.mark.parametrize(
    "text, expected",
    [
        ("<<set $x to 1 <!-- a note -->>>", "comments go outside a command"),
        ('<<button "Go" <!-- a note --> "Cave">><</button>>', "comments go outside a command"),
        ("<!-- never closed", "a comment is closed with -->"),
        ("<!-- crosses\r\na Windows line break -->", "crosses a Windows line break"),
    ],
)
def test_comment_problems_say_what_is_wrong(text, expected):
    errors = check_scene("Scene", text)
    assert any(expected in e for e in errors), errors


@pytest.mark.parametrize(
    "text",
    [
        '"""\r<<run alert(1)>>"""',
        '"""\u2028<<run alert(1)>>"""',
        "<!--\r<<run alert(1)>>-->",
        "<nowiki>\u2029<<run alert(1)>></nowiki>",
    ],
)
def test_a_line_separator_ends_verbatim_text_and_comments_like_in_sugarcube(text):
    # SugarCube's patterns are JavaScript: (?:.|\n) never crosses \r, \u2028
    # or \u2029, so this is no comment or verbatim text and <<run>> would run.
    errors = check_scene("Scene", text)
    assert any("<<run>>" in e for e in errors), errors


@pytest.mark.parametrize(
    "text",
    [
        "Read more at https://example.org/page",
        "Click javascript:alert(1)",
        "Write to mailto:someone",
        '<<set $x to "see https://example.org">>',
        '<<set $x to "javascript:alert(1)">>',
    ],
)
def test_web_addresses_are_refused(text):
    # SugarCube turns a bare address into a link, javascript: included.
    errors = check_scene("Scene", text)
    assert any("web address" in e for e in errors), errors


def test_upper_case_javascript_is_no_link_for_sugarcube():
    assert check_scene("Scene", "JavaScript: the language") == []


def test_a_scene_reports_at_most_twenty_problems():
    errors = check_scene("Scene", "<<timed 1s>>x<</timed>>\n" * 30)
    assert len(errors) == 21 and errors[-1] == "Passage 'Scene': 10 more problems not shown"


def test_a_scene_never_cuts_off_what_is_refused():
    # Only warnings are cut off: every refusal is reported.
    errors = check_scene("Scene", "<<timed 1s>>x<</timed>>\n" * 25 + "<<run x>>")
    assert any("Story JavaScript" in e for e in errors), errors


# --- the whole story ------------------------------------------------------------


def _passages(*scenes):
    return [{"id": str(i), "name": name, "text": text, "tags": tags} for i, (name, text, tags) in enumerate(scenes)]


def test_legend_focus_is_at_most_two_pairs():
    passages = _passages(
        ("A", "<<set $lead.mercy += 3>><<set $lead.cruelty += 2>>", []),
        ("B", "<<set $lead.fame += 1>>", []),
    )
    assert check_story(passages, {}).errors == []
    passages.append({"id": "9", "name": "C", "text": "<<set $lead.honor += 1>>", "tags": []})
    errors = check_story(passages, {}).errors
    assert any("3 Legend pairs" in e and "at most 2" in e for e in errors), errors


def test_legend_points_add_up_each_written_change_once_capped_at_ten():
    passages = _passages(
        ("A", "<<set $lead.mercy += 3>><<set $char[1].cruelty -= 2>>", []),
        ("B", "<<for _i, _c range $char>><<set _c.fame += 4>><</for>>", []),
        ("C", "[[Cheer|D][$lead.fame += 4, $lead.infamy += 4]]", []),
    )
    result = check_story(passages, {})
    assert result.errors == []
    assert result.legend_points == {"fame-infamy": 10, "mercy-cruelty": 5}


@pytest.mark.parametrize("name", sorted(story_rules.REFUSED_PASSAGES))
def test_sugarcube_special_scenes_wait(name):
    # Not refused: the story waits until the platform plays them.
    result = check_story(_passages((name, "Hello", [])), {})
    assert result.errors == []
    assert result.holds and not result.has_code
    assert [w["message"] for w in result.warnings] == [
        "this special scene isn't played - StoryInit, Retreat and LastResort are the only special scenes"
    ]


@pytest.mark.parametrize("tag", ["script", "stylesheet", "Twine.audio"])
def test_code_style_and_media_tags_are_refused(tag):
    errors = check_story(_passages(("Scene", "Hello", [tag])), {}).errors
    assert errors and "aren't accepted" in errors[0]


@pytest.mark.parametrize("tag, has_code", [("widget", False), ("init", True)])
def test_widget_and_init_scenes_wait(tag, has_code):
    result = check_story(_passages(("Scene", "Hello", [tag])), {})
    assert result.errors == [] and result.holds and result.has_code is has_code
    assert "aren't played yet" in result.warnings[0]["message"]


def test_quoted_destinations_must_exist_and_never_lead_to_last_resort():
    passages = _passages(
        ("Start", '<<button "Go" "Nowhere">><</button>> <<if visited("Gone")>>x<</if>>', []),
        ("Mid", '<<link "Out">><<goto "LastResort">><</link>>', []),
        ("LastResort", "Lost. <<set $isEnding to 'lastresort'>>", []),
    )
    errors = check_story(passages, {}).errors
    assert "Passage 'Start' names the scene 'Nowhere', which does not exist" in errors
    assert "Passage 'Start' names the scene 'Gone', which does not exist" in errors
    assert any(e.startswith("Passage 'Mid' leads to LastResort") for e in errors)


def test_test_characters_scene_is_not_read_as_a_scene():
    passages = _passages(("TestCharacters", '[{"firstName": "<<run x>>"}]', []))
    assert check_story(passages, {}).errors == []


# --- stylesheet -------------------------------------------------------------------


@pytest.mark.parametrize(
    "css, expected",
    [
        ("@font-face { font-family: x; }", "@font-face"),
        ("p { width: expression(alert(1)); }", "expression"),
        ("p { behavior: url(x.htc); }", "behavior"),
        ("p { -moz-binding: x; }", "-moz-binding"),
        ("p { background: javascript:alert(1); }", "javascript:"),
        ('p { background-image: image-set("https://example.org/a.png" 1x); }', "image-set()"),
        ("p { background: \\75rl(https://example.org/a.png); }", "backslash"),
        ("</style><script>alert(1)</script>", "< isn't accepted"),
    ],
)
def test_stylesheet_rules(css, expected):
    errors = check_story([], {"stylesheet": css}).errors
    assert any(expected in e for e in errors), errors


def test_a_normal_stylesheet_passes():
    css = ".row { display: flex; gap: 1em; }\n.scene > p:first-child { color: #c33; }\n.passage-title { color: red; }"
    assert check_story([], {"stylesheet": css}).errors == []


def test_the_scene_itself_may_be_styled():
    # The platform's buttons are drawn outside the scene's sealed frame, so a
    # text inset with full-width images only changes the story's own scene.
    css = (
        ".passage { padding: 0 20px; line-height: 1.7; }\n"
        ".passage img { width: calc(100% + 40px); margin-left: -20px; margin-right: -20px; }\n"
        "#passages p { color: #ddd; }\n#story { margin: 0; }"
    )
    assert check_story([], {"stylesheet": css}).errors == []


@pytest.mark.parametrize(
    "css",
    [
        "#ui-bar { display: none; }",
        ".error-view { display: none; }",
        ".wud-hotspots { display: none; }",
        'body[data-passage="Cave"] p { color: red; }',
        '[data-tags~="night"] { background: black; }',
        'div[class~="passage"] { padding: 0; }',
        '[id="passages"] { padding: 0; }',
    ],
)
def test_the_platforms_parts_of_the_page_are_not_for_stories(css):
    # A story can't hide or move the clickable image areas, the error box or
    # SugarCube's side bar, nor reach them by attribute.
    errors = check_story([], {"stylesheet": css}).errors
    assert any("is the platform's part of the page" in e for e in errors), errors


@pytest.mark.parametrize(
    "html",
    ['<div class="passage">x</div>', '<div class="row passage">x</div>', '<span class="wud-hotspots">x</span>',
     '<span class="wud-hotspot">x</span>', '<div class="error-view">x</div>',
     '<div id="passages">x</div>', '<div id="ui-bar">x</div>'],
)
def test_scenes_dont_use_the_platforms_classes_or_ids(html):
    errors = check_story(_passages(("Scene", html, [])), {}).errors
    assert any("is the platform's" in e for e in errors), errors


def test_own_classes_that_start_like_the_platforms_are_fine():
    result = check_story(_passages(("Scene", '<div class="passage-title">x</div>', [])), {})
    assert result.errors == [] and result.warnings == []


@pytest.mark.parametrize("tag", ["stylesheet", "Stylesheet", "STYLESHEET", "script"])
@pytest.mark.parametrize(
    "text",
    [
        "body { color: red; }",
        # Code that passes the stylesheet rules - SugarCube plays a stylesheet
        # scene as an ordinary one in a Twine 2 story, link text and all.
        "[[alert(1)|End]]",
        "[[Go on|End][$x to alert(1)]]",
    ],
)
def test_stylesheet_and_script_scenes_are_refused(tag, text):
    tagged = _passages(("Story Stylesheet", text, [tag]))
    errors = check_story(tagged, {}).errors
    assert any(e.startswith(f"Passage 'Story Stylesheet' is tagged {tag}") for e in errors), errors


# --- story format -------------------------------------------------------------------


@pytest.mark.parametrize(
    "story_data",
    [
        {"storyFormat": "SugarCube", "storyFormatVersion": "2.36.1"},
        {"storyFormat": "SugarCube-evil", "storyFormatVersion": "2.37.3"},
        {"storyFormat": "Harlowe", "storyFormatVersion": "3.3.9"},
        {"storyFormat": "SugarCube"},
        {},
    ],
)
def test_only_the_platforms_sugarcube_is_accepted(story_data):
    assert "only SugarCube 2.37.3 is accepted" in story_rules.format_error(story_data)


def test_the_platforms_sugarcube_passes():
    assert story_rules.format_error({"storyFormat": "SugarCube", "storyFormatVersion": "2.37.3"}) is None


# --- TestCharacters ------------------------------------------------------------------


def _party_member(**changes):
    member = {
        "firstName": "Grimjaw", "lastName": "Ironfoot", "race": "dwarf", "gender": "m",
        "birthsign": "grit_stitch_brand",
        "might": 18, "agility": 9, "endurance": 17, "precision": 10,
        "will": 11, "insight": 8, "lore": 6, "presence": 7,
        "class1": "none", "classLvl1": 0, "class2": "none", "classLvl2": 0,
        "prof1": "blacksmith", "profLvl1": 3, "prof2": "miner", "profLvl2": 2, "prof3": "none", "profLvl3": 0,
        "equipment": ["rope_1"],
    }
    member.update(changes)
    return {k: v for k, v in member.items() if v is not ...}


def test_a_party_is_normalised():
    party, errors = read_party(json.dumps([_party_member(mercy=5, firstName="grimjaw")]), None)
    assert errors == []
    member = party[0]
    assert member["name"] == f"{member['firstName']} Ironfoot"
    assert member["mercy"] == 5 and member["cruelty"] == 0 and member["fame"] == 0
    assert set(member) == set(story_rules.CHARACTER_FIELDS)


@pytest.mark.parametrize(
    "changes, expected",
    [
        ({"extra": 1}, "unknown values: extra"),
        ({"might": ...}, "missing values: might"),
        ({"firstName": "<<run x>>"}, "First name"),
        ({"name": "Someone Else"}, "name is made from firstName and lastName"),
        ({"gender": "x"}, "gender is one of"),
        ({"race": "orc"}, "isn't a race"),
        ({"birthsign": "moon"}, "isn't a birthsign"),
        ({"class1": "warrior"}, "classes don't exist yet"),
        ({"prof1": "none", "profLvl1": 0}, 'prof1 is a profession, never "none"'),
        ({"prof2": "none", "profLvl2": 0, "prof3": "miner", "profLvl3": 1}, "in order"),
        ({"prof3": "hunter", "profLvl3": 1}, "same group"),
        ({"profLvl1": 31}, "from 1 to 30"),
        ({"profLvl3": 2}, "profLvl3 is 0"),
        ({"might": 0}, "might is a whole number of at least 1"),
        ({"might": True}, "might is a whole number"),
        ({"might": 90}, "Body"),
        ({"will": 1, "insight": 1, "lore": 1, "presence": 1, "might": 9, "agility": 9, "endurance": 9, "precision": 1}, "together"),
        ({"equipment": ["laser_9"]}, "not items in the game: laser_9"),
        ({"equipment": "rope_1"}, "equipment is a list"),
        ({"mercy": 3, "cruelty": 2}, "one scale"),
        ({"mercy": 101}, "from 0 to 100"),
    ],
)
def test_party_problems(changes, expected):
    party, errors = read_party(json.dumps([_party_member(**changes)]), 4)
    assert party is None
    assert any(expected in e for e in errors), errors


def test_fame_and_infamy_may_both_be_above_zero():
    party, errors = read_party(json.dumps([_party_member(fame=10, infamy=4)]), 4)
    assert errors == [] and party[0]["infamy"] == 4


def test_party_size_follows_max_char_num():
    two = json.dumps([_party_member(), _party_member(firstName="Elara")])
    assert read_party(two, 4)[1] == []
    assert read_party(two, 1)[1] == ["TestCharacters: at most 1 character (the story's $meta_maxCharNum, at most 4)"]
    five = json.dumps([_party_member()] * 5)
    assert any("at most 4" in e for e in read_party(five, None)[1])


@pytest.mark.parametrize("text", ["", "{}", "[]", "not json", '{"firstName": "Grimjaw"}'])
def test_a_party_is_a_json_list(text):
    party, errors = read_party(text, 4)
    assert party is None and errors and errors[0].startswith("TestCharacters:")


def test_no_test_characters_scene_means_no_party():
    assert read_party(None, 4) == (None, [])


# --- every choice in a scene has its own text -----------------------------------
# The player's click comes back to the server as the choice's text, never as
# where it leads, so two choices a scene can show together must differ.


@pytest.mark.parametrize(
    "text",
    [
        "[[Go on|Cave]] [[Go on|Camp]]",
        "[[Go on|Cave]] [[go  ON|Camp]]",
        "[[Cave]] [[Cave<-Enter]] [[Cave]]",
        '[[Cave]] <<button "Cave" "Camp">><</button>>',
        "[[Rest|Camp]] <<link [[Rest|Inn]]>><</link>>",
        "<<button [[Rest|Camp]]>><</button>><<button [[Rest|Inn]]>><</button>>",
        "<<if $a>>[[Rest|Camp]]<</if>> <<if $b>>[[Rest|Inn]]<</if>>",
        "<<if $a>>[[Rest|Camp]]<<if $b>>[[Rest|Inn]]<</if>><</if>>",
        "[[Rest|Camp]] <<if $a>>[[Rest|Inn]]<</if>>",
        # Also in branches that exclude each other: a text names one link, so
        # the server knows where a click leads without running the scene.
        "<<if $hasKey>>[[Open the door|Hall]]<<else>>[[Open the door|Locked]]<</if>>",
        "<<if $a>>[[Rest|Camp]]<<elseif $b>>[[Rest|Inn]]<</if>>",
        '<<switch $guard>><<case "asleep">>[[Sneak past|Hall]]<<default>>[[Sneak past|Cell]]<</switch>>',
        "<<if $a>>[[Go on|Cave]]<<else>>[[Go on|Cave]]<</if>>",
    ],
)
def test_two_choices_with_the_same_text_are_refused(text):
    problems = check_scene("Scene", text)
    assert any("is in this scene twice" in p for p in problems), problems


@pytest.mark.parametrize(
    "text",
    [
        "<<if $hasKey>>[[Unlock the door|Hall]]<<else>>[[Try the door|Locked]]<</if>>",
        '<<switch $guard>><<case "asleep">>[[Sneak past|Hall]]<<default>>[[Wait in the dark|Cell]]<</switch>>',
        # Hotspots and image links have no text of their own.
        "[img[gate.webp][Gate]] [img[gate.webp][Gate]] <<area 0.10 0.20 0.30 0.40 [[Gate]]>> <<area 0.50 0.20 0.30 0.40 [[Gate]]>>",
        "[[Go north|North]] [[Walk north->North]] [[North<-Head north]]",
    ],
)
def test_choices_with_their_own_text_pass(text):
    assert check_scene("Scene", text) == []


def test_no_choices_inside_a_loop_over_the_party():
    problems = check_scene("Scene", "<<for _i, _c range $char>><<button [[Help|Camp]]>><</button>><</for>>")
    assert any("don't go inside <<for>>" in p for p in problems), problems
    # Commands without a choice still may.
    assert check_scene(
        "Scene", '<<for _i, _c range $char>><<if _c.equipment.includes("rope_1")>><<set _hasRope to true>><</if>><</for>>'
    ) == []


@pytest.mark.parametrize(
    "text",
    [
        '<<listbox "$weapon">><<option "Sword" "a">><<option "sword" "b">><</listbox>>',
        # Scene-wide: also across lists, and against links and labels.
        '<<listbox "$weapon">><<option "Sword" "a">><</listbox>><<cycle "$stance">><<option "Sword" "b">><</cycle>>',
        '<<listbox "$where">><<option "Rest" "a">><</listbox>> [[Rest|Camp]]',
        '<label><<radiobutton "$a" true>> Yes</label><label><<radiobutton "$b" true>> Yes</label>',
        '<label><<radiobutton "$path" "north">> North</label> [[North]]',
        '<label><<checkbox "$x" false true>> Rest</label> <<listbox "$w">><<option "rest" "a">><</listbox>>',
    ],
)
def test_every_pickable_text_appears_once_in_a_scene(text):
    problems = check_scene("Scene", text)
    assert any("is in this scene twice" in p for p in problems), problems


@pytest.mark.parametrize(
    "text, expected",
    [
        ('<<radiobutton "$path" "north">> North', "sits inside a <label>"),
        ('<<checkbox "$careful" false true>> Move carefully', "sits inside a <label>"),
        ('<label><<radiobutton "$path" "north">></label>', "needs its own text"),
        ('<label><<radiobutton "$path" "north">> $direction</label>', "holds only its text"),
        ('<label><<radiobutton "$path" "north">> [[North]]</label>', "holds only its text"),
        ('<label><<radiobutton "$path" "north">><<radiobutton "$path" "south">> Both</label>', "one radio button or checkbox per <label>"),
        ('<label><<radiobutton "$path" "north">> North', "never closed"),
        ("North</label>", "closes nothing"),
        ('<label><label><<radiobutton "$path" "north">> North</label></label>', "inside another <label>"),
        ('<<if $a>><label><</if>><<radiobutton "$path" "north">> North</label>', "same part of the scene"),
        ('<label><<radiobutton "$path" "north">> North (left)</label>', "like <label>"),
        ('<<for _i, _c range $char>><label><<checkbox "$x" false true>> Help</label><</for>>', "don't go inside <<for>>"),
    ],
)
def test_radio_buttons_and_checkboxes_sit_in_a_label_with_their_own_text(text, expected):
    problems = check_scene("Scene", text)
    assert any(expected in p for p in problems), problems


@pytest.mark.parametrize(
    "text",
    [
        '<label><<radiobutton "$path" "north">> North</label> <label><<radiobutton "$path" "south">> South</label>',
        '<label class="pick"><<checkbox "$careful" false true>> Move carefully</label>',
        '<label>North <<radiobutton "$path" "north">></label>',
        '<label><!-- the way --><<radiobutton "$path" "north">> North</label>',
        "<label>A plain label without a choice</label>",
        '<<if $a>><label><<radiobutton "$path" "north">> North</label><</if>>',
    ],
)
def test_labelled_choices_pass(text):
    assert check_scene("Scene", text) == []


@pytest.mark.parametrize(
    "text",
    [
        '<<button "Run for it">><<goto `either("P1", "P7", "P8")`>><</button>>',
        '<<button "Turn the page">><<goto `"P" + random(1, 30)`>><</button>>',
        '<<link "Open the book">><<goto `"" + random(1, 12)`>><</link>>',
        '<<button "Toss">><<goto `either( "Heads" , "Tails" )`>><</button>>',
    ],
)
def test_random_jumps_in_backquotes_pass(text):
    assert check_scene("Scene", text) == []


@pytest.mark.parametrize(
    "text, expected",
    [
        # Without backquotes SugarCube 2.37.3 takes the pick as a scene name.
        ('<<button "Run">><<goto either("P1", "P7")>><</button>>', "without backquotes"),
        ('<<button "Run">><<goto "P" + random(1, 30)>><</button>>', "without backquotes"),
        ('<<button "Go">><<goto `alert(1)`>><</button>>', "picks one at random in backquotes"),
        ('<<button "Go">><<goto `either($a, "P1")`>><</button>>', "picks one at random in backquotes"),
        ('<<button "Go">><<goto `"P" + $page`>><</button>>', "picks one at random in backquotes"),
        ('<<button "Go">><<goto `either("P1")`>><</button>>', "picks one at random in backquotes"),
        ('<<button "Go">><<goto `"P" + random(1, 500)`>><</button>>', "at most 200 scenes"),
        ('<<button "Go">><<goto `"P" + random(9, 3)`>><</button>>', "lower number first"),
        ('<<button "Go">><<goto `either("P1", "P1")`>><</button>>', "each scene once"),
        ('<<button "Go">><<goto `either("P1", "")`>><</button>>', "never an empty one"),
        ('<<button "Go">><<goto `either("P<b>", "P2")`>><</button>>', "<"),
        ('<<goto `either("P1", "P7")`>>', "never jumps on its own"),
    ],
)
def test_random_jumps_take_only_the_two_shapes(text, expected):
    problems = check_scene("Scene", text)
    assert any(expected in p for p in problems), problems


def test_every_scene_a_random_jump_can_reach_must_exist():
    start = {"name": "Start", "text": '<<button "Turn the page">><<goto `"P" + random(1, 30)`>><</button>>'}
    some = [{"name": f"P{i}", "text": "x"} for i in range(1, 25)]
    errors = story_rules.check_story([start] + some, {}).errors
    assert "Passage 'Start' names the scenes 'P25', 'P26', 'P27' and 3 more, which do not exist" in errors
    every = [{"name": f"P{i}", "text": "x"} for i in range(1, 31)]
    assert not [e for e in story_rules.check_story([start] + every, {}).errors if "exist" in e]
    pick = {"name": "Start", "text": '<<button "Run">><<goto `either("P1", "Gone")`>><</button>>'}
    errors = story_rules.check_story([pick, {"name": "P1", "text": "x"}], {}).errors
    assert "Passage 'Start' names the scene 'Gone', which does not exist" in errors


def test_options_are_written_out_never_taken_from_a_variable():
    problems = check_scene("Scene", '<<listbox "$item">><<optionsfrom $inventory>><</listbox>>')
    assert any("<<optionsfrom>> isn't accepted" in p for p in problems), problems
    # Changing options: radio buttons inside <<if>>.
    assert check_scene(
        "Scene",
        '<<if $hasRope>><label><<radiobutton "$tool" "rope">> Rope</label><</if>>'
        '<label><<radiobutton "$tool" "torch">> Torch</label>',
    ) == []
