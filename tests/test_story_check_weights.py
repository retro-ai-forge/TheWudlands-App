"""How much each finding of the story check weighs (backend/story_rules.py,
docs/STORY-RULES.md "How the check decides"): refused (BLOCK), the story
waits (CODE, UNSUPPORTED) or the reviewer decides (NOTE)."""

import pytest

from backend import story_rules
from backend.story_rules import BLOCK, CODE, NOTE, UNSUPPORTED, check_story


def _one(text, tags=(), script=""):
    passages = [{"id": "1", "name": "Scene", "text": text, "tags": list(tags)}]
    return check_story(passages, {"script": script})


def _kinds(result):
    return {w["kind"] for w in result.warnings}


@pytest.mark.parametrize(
    "text, words",
    [
        ("<<script>>alert(1)<</script>>", "Story JavaScript"),
        ("<<run alert(1)>>", "Story JavaScript"),
        ("<script>alert(1)</script>", "Story JavaScript"),
        ('<span onclick="alert(1)">x</span>', "Story JavaScript"),
        ('<p onmouseover="x()">x</p>', "Story JavaScript"),
        ("<style>p { color: red }</style>", "Story Stylesheet"),
        ("See https://example.com for more", "web addresses"),
        ('<<set $x to "https://example.com">>', "web address"),
        ('<a href="Cave">in</a>', "outside the story"),
        ('<span title="x" href="//evil.example">x</span>', "outside the story"),
        ("<<if Config.debug>>x<</if>>", "'Config' reaches into SugarCube"),
        ("<<print $x.constructor>>", "'.constructor' reaches into SugarCube"),
        ("<<set $x to eval>>", "'eval' reaches into SugarCube"),
        ("<<set $lead.might to 9>>", "only the characters' Legend"),
        ("<<set $lead.mercy to 50>>", "+= or -="),
        ("<<set $char to 1>>", "the server sets the party"),
        ("<<set $meta_title to 'x'>>", "is set in StoryInit"),
    ],
)
def test_the_worst_cases_are_refused(text, words):
    result = _one(text)
    assert any(words in e for e in result.errors), (result.errors, result.warnings)


@pytest.mark.parametrize(
    "text, words",
    [
        # Hidden where the reading doesn't go: still found.
        ('<<linkreplace "Open">><<run alert(1)>><</linkreplace>>', "Story JavaScript"),
        ("<<timed 1s>><script>x()</script><</timed>>", "Story JavaScript"),
        ("<<rollgoto Config.history>>", "'Config' reaches into SugarCube"),
        ("<<rollgoto `x.constructor`>>", "'.constructor' reaches into SugarCube"),
        ('<span style="background: url(//evil.example/x.png)">x</span>', "outside the story"),
        ("@@background:url(x.png);Hi@@", "outside the story"),
        ("<<set $x to window.fetch('https://evil.example')>>", "web address"),
    ],
)
def test_the_worst_cases_are_found_in_parts_not_read(text, words):
    result = _one(text)
    assert any(words in e for e in result.errors), (result.errors, result.warnings)


def test_the_worst_cases_are_found_in_a_refused_scene():
    result = _one("<<widget 'roll'>><<run x>><</widget>>", tags=["widget"])
    assert any("Story JavaScript" in e for e in result.errors), result.errors


@pytest.mark.parametrize(
    "text, kind",
    [
        ("<<timed 2s>>x<</timed>>", UNSUPPORTED),
        ('<<textbox "$name" "">>', UNSUPPORTED),
        ('<<goto "Cave">>', UNSUPPORTED),
        ('<<include "Cave">>', UNSUPPORTED),
        ('<<linkreplace "Open">>The door opens.<</linkreplace>>', UNSUPPORTED),
        ("[[Go|Cave]] [[Go|Cave]]", UNSUPPORTED),
        ("<<set $x to Math.floor(2.5)>>", CODE),
        ("<<set $x to `1 + 1`>>", CODE),
        ("<<rollgoto>>", CODE),
        ("[[alert(1)|Cave]]", CODE),
        # <<link ...>> is a command, never an HTML <link> tag.
        ('<<link "alert(1)">><</link>>', CODE),
        ('<<link "<b>Go</b>" "Cave">><</link>>', CODE),
        ('<span class="<<print $mood>>">x</span>', CODE),
        ("<<for _i to 0; _i lt 3; _i++>>x<</for>>", CODE),
    ],
)
def test_what_the_check_cant_read_or_the_platform_cant_play_waits(text, kind):
    result = _one(text)
    assert result.errors == [], result.errors
    assert kind in _kinds(result) and result.holds
    assert result.has_code is (kind == CODE)
    assert "Scene" in result.waiting


@pytest.mark.parametrize(
    "text",
    [
        '<span style="color: red">x</span>',
        "@@color:red;x@@",
        "/* a note */",
        "<<unset $x>>",
        '<span id="x">y</span>',
        "<table><tr><td>x</td></tr></table>",
        "<<print>>",
    ],
)
def test_harmless_things_are_notes(text):
    result = _one(text)
    assert result.errors == [], result.errors
    assert _kinds(result) == {NOTE}, result.warnings
    assert not result.holds and not result.has_code and not result.waiting


def test_an_accepted_scene_has_no_findings():
    result = _one('Hello. <<set $gold to 5>> [[Go north|North]]')
    assert result.errors == [] and result.warnings == []
    assert not result.holds and not result.has_code


def test_story_javascript_waits_and_marks_the_story():
    result = _one("Hello", script="setup.roll = function (n) { return n * 2; };")
    assert result.errors == []
    assert result.has_code and result.holds
    assert result.warnings[0]["place"] == "Story JavaScript"


@pytest.mark.parametrize(
    "script, words",
    [
        ("Config.history.maxStates = 5;", "line 1: 'Config' reaches into SugarCube"),
        ("var a = 1;\nEngine.restart();", "line 2: 'Engine' reaches into SugarCube"),
        ("fetch('https://evil.example/x');", "'fetch' reaches into SugarCube"),
        ("var u = 'https://evil.example';", "web addresses"),
        ("x.constructor.constructor('return 1')();", "'.constructor'"),
        ("globalThis.y = 1;", "'globalThis'"),
    ],
)
def test_story_javascript_refuses_the_system_names(script, words):
    result = _one("Hello", script=script)
    assert any(e.startswith("Story JavaScript, ") and words in e for e in result.errors), result.errors


@pytest.mark.parametrize(
    "script",
    [
        "// Config and Engine are SugarCube's - not used here\nsetup.x = 1;",
        "/* see https://example.com */ setup.x = 1;",
        "setup.title = 'Save the village';",
        'setup.label = "UI and Dialog";',
        "setup.myEngine = 1; setup.Config2 = 2;",
    ],
)
def test_story_javascript_names_in_text_and_comments_are_fine(script):
    result = _one("Hello", script=script)
    assert result.errors == [], result.errors


def test_finding_text_reads_like_a_refusal():
    item = story_rules.finding("Passage 'Cave'", 3, NOTE, "a comment")
    assert story_rules.finding_text(item) == "Passage 'Cave', line 3: a comment"
    assert story_rules.finding_text(story_rules.finding("Story JavaScript", None, CODE, "x")) == "Story JavaScript: x"
    assert BLOCK not in story_rules.HOLDING_KINDS


def test_many_notes_stay_notes():
    # The "more problems not shown" line weighs what it hides.
    result = _one('<span style="color: red">x</span>\n' * 25)
    assert result.errors == [] and not result.holds and not result.has_code
    assert result.warnings[-1]["message"] == "5 more problems not shown"
    assert _kinds(result) == {NOTE}


def test_hidden_findings_that_wait_still_hold():
    result = _one('<span style="color: red">x</span>\n' * 20 + "<<timed 1s>>x<</timed>>\n" * 3)
    assert result.warnings[-1]["kind"] == UNSUPPORTED and result.holds
