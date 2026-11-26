"""The ending rules (docs/STORY-RULES.md "Endings"): what $isEnding is set to,
where each value may be set, at least one success, and $meta_endings listing
every success and failure. Pure functions, no database."""

import pytest

from backend import story_rules
from backend.auth_routes import _check_twine_syntax
from backend.twine_graph import build_story_graph

RETREAT = '"failure"'
ENDINGS = '<<set $meta_endings to ["success", "failure:lost", ' + RETREAT + ']>>'
INIT = (
    "<<set $meta_title to 'Title'>>"
    "<<set $meta_description to 'Desc'>>"
    "<<set $meta_author to 'Auth'>>"
    "<<set $meta_maxCharNum to 1>>"
    "<<set $meta_adventureTier to 1>>"
    "<<set $meta_durationWeeks to 1>>"
    "<<set $meta_access to 'paid'>>"
    "<<set $meta_genres to ['adventure']>>"
    "<<set $meta_allowRunAway to true>>"
    "[img[cover.webp]]"
)


def _story(scenes: dict, endings: str = ENDINGS) -> dict:
    """A story from {name: text}: StoryInit (with `endings`), Start, Retreat
    and LastResort get working defaults unless given."""
    texts = {
        "StoryInit": INIT + endings,
        "Start": "[[Win|Won]] [[Lose|Lost]]",
        "Won": '<<set $isEnding to "success">>',
        "Lost": '<<set $isEnding to "failure:lost">>',
        "Retreat": 'You run. <<set $isEnding to "failure">>',
        "LastResort": 'The path gives way. <<set $isEnding to "lastresort">>',
    }
    texts.update(scenes)
    passages = [
        {"id": str(i), "name": name, "text": text, "tags": []}
        for i, (name, text) in enumerate((n, t) for n, t in texts.items() if t is not None)
    ]
    start = next(p["id"] for p in passages if p["name"] == "Start")
    return {
        "name": "Probe story",
        "storyData": {
            "startPassage": start, "storyFormat": "SugarCube", "storyFormatVersion": "2.37.3",
            "tags": ["adventure"],
        },
        "passages": passages,
    }


def _errors(scenes: dict, **kw) -> list:
    return _check_twine_syntax(_story(scenes, **kw))["errors"]


def test_the_default_story_passes():
    result = _check_twine_syntax(_story({}))
    assert result["errors"] == []
    assert result["warnings"] == []


# --- the values ----------------------------------------------------------------


@pytest.mark.parametrize("value, kind", [
    ("success", "success"),
    ("failure", "failure"),
    ("success:dragon_slain", "success"),
    ("failure:Captured-2", "failure"),
    ("retreat", None),
    ("lastresort", "lastresort"),
    ("Success", None),
    ("win", None),
    ("success:", None),
    ("success:1st", None),
    ("success:dragon slain", None),
    ("success:title:won_baron_title", "success"),
    ("failure:road:out_of_food", "failure"),
    ("success:a:b:c", None),
    ("success:a::b", None),
    ("success:title:", None),
    ("retreat:far", None),
    ("lastresort:x", None),
    ("success:" + "a" * story_rules.ENDING_NAME_MAX, "success"),
    ("success:" + "a" * (story_rules.ENDING_NAME_MAX + 1), None),
    (True, None),
])
def test_ending_kind(value, kind):
    assert story_rules.ending_kind(value) == kind


@pytest.mark.parametrize("text", [
    "<<set $isEnding to true>>",
    "<<set $isEnding to false>>",
])
def test_true_and_false_are_refused_with_the_new_form(text):
    errors = _errors({"Won": text})
    assert any("true and false aren't used any more" in e and '"success"' in e for e in errors)


@pytest.mark.parametrize("text", [
    '<<set $isEnding to "win">>',
    '<<set $isEnding to "success:">>',
    '<<set $isEnding to $result>>',
    '<<set $isEnding to "suc" + "cess">>',
    '<<set $isEnding += "success">>',
])
def test_other_values_are_refused(text):
    errors = _errors({"Won": text})
    assert any("$isEnding is set to" in e for e in errors), errors


def test_single_quotes_work_too():
    assert _errors({"Won": "<<set $isEnding to 'success'>>"}) == []


def test_story_init_never_ends_the_story():
    errors = _errors({"StoryInit": INIT + ENDINGS + '<<set $isEnding to "success">>'})
    assert any("StoryInit never ends the story" in e for e in errors)


def test_a_scene_may_end_differently_by_a_condition():
    endings = '<<set $meta_endings to ["success:rich", "failure:poor", ' + RETREAT + ']>>'
    scenes = {
        "Start": "[[Count|Count]]",
        "Won": None,
        "Lost": None,
        "Count": '<<if $gold gte 10>><<set $isEnding to "success:rich">>'
                 '<<else>><<set $isEnding to "failure:poor">><</if>>',
    }
    assert _errors(scenes, endings=endings) == []


# --- where each value goes -----------------------------------------------------


def test_last_resort_must_set_lastresort():
    errors = _errors({"LastResort": "The path gives way."})
    assert any('LastResort must contain <<set $isEnding to "lastresort">>' in e for e in errors)


def test_last_resort_sets_nothing_else():
    errors = _errors({"LastResort": '<<set $isEnding to "success">>'})
    assert any("LastResort must contain" in e for e in errors)


def test_lastresort_only_in_last_resort():
    errors = _errors({"Won": '<<set $isEnding to "lastresort">>'})
    assert any("'Won' sets $isEnding to \"lastresort\" — only LastResort does" in e for e in errors)


def test_the_retreat_story_ends_in_failures():
    errors = _errors({"Retreat": "[[Hide|Hide]]", "Hide": '<<set $isEnding to "success">>'})
    assert any("'Hide' is an ending of the Retreat story — running away is a failure" in e for e in errors)


def test_retreat_story_with_several_endings_passes():
    endings = '<<set $meta_endings to ["success", "failure:lost", "failure", "failure:fled_the_crypt"]>>'
    scenes = {
        "Retreat": "[[Hide|Hide]] [[Flee|Flee]]",
        "Hide": '<<set $isEnding to "failure">>',
        "Flee": '<<set $isEnding to "failure:fled_the_crypt">>',
    }
    assert _errors(scenes, endings=endings) == []


def test_a_failure_may_end_both_stories():
    """Running away is a failure like any other: one tag may end the main story
    and the Retreat story."""
    endings = '<<set $meta_endings to ["success", "failure:lost"]>>'
    assert _errors({"Retreat": '<<set $isEnding to "failure:lost">>'}, endings=endings) == []


@pytest.mark.parametrize("value", ["retreat", "retreat:fled_the_crypt"])
def test_retreat_is_not_a_value(value):
    errors = _errors({"Retreat": f'<<set $isEnding to "{value}">>'})
    assert any('"retreat" isn\'t an ending value - running away is a failure' in e for e in errors), errors


def test_a_retreat_failure_is_listed_too():
    errors = _errors({"Retreat": '<<set $isEnding to "failure:fled_the_crypt">>'})
    assert any(
        "'Retreat' ends with \"failure:fled_the_crypt\", which the $meta_endings list in StoryInit doesn't hold" in e
        for e in errors
    )


def test_the_main_story_needs_a_success():
    endings = '<<set $meta_endings to ["failure:lost", ' + RETREAT + ']>>'
    errors = _errors({"Start": "[[Lose|Lost]]", "Won": None}, endings=endings)
    assert any("The main story has no success ending" in e for e in errors)


def test_a_named_success_counts():
    endings = '<<set $meta_endings to ["success:rich", "failure:lost", ' + RETREAT + ']>>'
    assert _errors({"Won": '<<set $isEnding to "success:rich">>'}, endings=endings) == []


def test_endings_with_a_group():
    endings = ('<<set $meta_endings to ["success:title:won_baron_title", "success:title:won_lord_title", '
               '"failure:road:out_of_food", "failure:road:out_of_water", "failure:ran_away"]>>')
    scenes = {
        "Start": "[[Baron|Won]] [[Lord|Lord]] [[Food|Lost]] [[Water|Thirst]]",
        "Won": '<<set $isEnding to "success:title:won_baron_title">>',
        "Lord": '<<set $isEnding to "success:title:won_lord_title">>',
        "Lost": '<<set $isEnding to "failure:road:out_of_food">>',
        "Thirst": '<<set $isEnding to "failure:road:out_of_water">>',
        "Retreat": 'You run. <<set $isEnding to "failure:ran_away">>',
    }
    assert _errors(scenes, endings=endings) == []


def test_a_success_only_in_the_retreat_story_does_not_count():
    endings = '<<set $meta_endings to ["failure:lost"]>>'
    scenes = {"Start": "[[Lose|Lost]]", "Won": None, "Retreat": '<<set $isEnding to "success">>'}
    errors = _errors(scenes, endings=endings)
    assert any("The main story has no success ending" in e for e in errors)


def test_an_ending_scene_is_a_dead_end():
    errors = _errors({"Won": '<<set $isEnding to "success">> [[Again|Start]]'})
    assert any("'Won' is marked as an ending but has outgoing links" in e for e in errors)


def test_a_dead_end_needs_an_ending():
    errors = _errors({"Won": "Nothing here."})
    assert any("'Won' has no outgoing links and doesn't set $isEnding" in e for e in errors)


# --- $meta_endings ------------------------------------------------------------


def test_meta_endings_is_required():
    errors = _errors({}, endings="")
    assert any("StoryInit must list every success and failure ending in $meta_endings" in e
               for e in errors)


def test_every_success_and_failure_is_declared():
    errors = _errors({"Won": '<<set $isEnding to "success:dragon_slain">>'})
    assert any(
        "'Won' ends with \"success:dragon_slain\", which the $meta_endings list in StoryInit doesn't hold" in e
        for e in errors
    )


def test_a_declared_ending_no_scene_sets_is_a_note():
    endings = '<<set $meta_endings to ["success", "failure:lost", "failure:eaten", ' + RETREAT + ']>>'
    result = _check_twine_syntax(_story({}, endings=endings))
    assert result["errors"] == []
    notes = [w for w in result["findings"] if w["kind"] == story_rules.NOTE]
    assert any('lists "failure:eaten", but no scene ends with it' in w["message"] for w in notes)
    assert not result["held"]


@pytest.mark.parametrize("endings, message", [
    ('<<set $meta_endings to ["lastresort"]>>', "isn't a success or failure ending"),
    ('<<set $meta_endings to ["retreat"]>>', "isn't a success or failure ending"),
    ('<<set $meta_endings to ["win"]>>', "isn't a success or failure ending"),
    ('<<set $meta_endings to ["success:a:b:c"]>>', "isn't a success or failure ending"),
    ('<<set $meta_endings to ["success:You won."]>>', "isn't a success or failure ending"),
    ('<<set $meta_endings to ["success", "success"]>>', "listed twice"),
    ('<<set $meta_endings to ["success:title", "success:title:won_baron_title"]>>',
     '"success:title" is both an ending and the group of "success:title:won_baron_title"'),
    ('<<set $meta_endings to [5]>>', "lists each ending in quotes"),
    ('<<set $meta_endings to [success]>>', "lists each ending in quotes"),
    ('<<set $meta_endings to "success">>', "$meta_endings lists every success and failure ending"),
    ('<<set $meta_endings to ["success"]>><<set $meta_endings to ["failure"]>>', "set once"),
    # the old form, ending -> teaser
    ('<<set $meta_endings to {"success": "You made it."}>>', "$meta_endings is a list of your endings, without teasers"),
])
def test_bad_meta_endings_are_refused(endings, message):
    errors = _errors({}, endings=endings)
    assert any(message in e for e in errors), errors


def test_meta_endings_only_in_story_init():
    errors = _errors({"Won": '<<set $meta_endings to ["success"]>><<set $isEnding to "success">>'})
    assert any("$meta_endings is set in StoryInit" in e for e in errors)


def test_braces_elsewhere_still_wait():
    result = _check_twine_syntax(_story({"StoryInit": INIT + ENDINGS + '<<set $bag to {"a": 1}>>'}))
    waiting = [w for w in result["findings"] if w["kind"] == story_rules.CODE]
    assert any("{ } aren't accepted" in w["message"] for w in waiting)


def test_a_trailing_comma_is_fine():
    endings = '<<set $meta_endings to ["success", "failure:lost", ' + RETREAT + ',]>>'
    assert _errors({}, endings=endings) == []


def test_check_story_hands_over_the_endings():
    story = _story({})
    rules = story_rules.check_story(story["passages"], story["storyData"])
    assert rules.endings == {
        "Won": ["success"], "Lost": ["failure:lost"], "Retreat": ["failure"], "LastResort": ["lastresort"],
    }
    assert rules.declared_endings == ["success", "failure:lost", "failure"]


# --- $follows -----------------------------------------------------------------


@pytest.mark.parametrize("text", [
    '<<set $follows to "x">>',
    '<<radiobutton "$follows" "north">>',
])
def test_a_story_never_sets_follows(text):
    errors = _errors({"Start": text + " [[Win|Won]] [[Lose|Lost]]"})
    assert any("$follows" in e for e in errors), errors


def test_a_story_reads_follows():
    scenes = {"Start": '<<if $follows is "abc:success">>Welcome back.<<else>>Welcome.<</if>> [[Win|Won]] [[Lose|Lost]]'}
    assert _errors(scenes) == []


# --- the step graph -----------------------------------------------------------


def test_graph_keeps_each_endings_values():
    story = _story({})
    graph = build_story_graph(story["passages"], story["storyData"])
    assert graph["endings"] == {"Won": "finished", "Lost": "finished", "Retreat": "finished"}
    assert graph["endingValues"] == {"Won": ["success"], "Lost": ["failure:lost"], "Retreat": ["failure"]}


def test_an_old_ending_gets_only_the_helpful_message():
    errors = _errors({"Won": "<<set $isEnding to true>>"})
    assert any("true and false aren't used any more" in e for e in errors)
    assert not any("doesn't set $isEnding" in e or "has no ending" in e for e in errors), errors


def test_a_sentence_after_the_ending_says_what_goes_where():
    errors = _errors({"Won": '<<set $isEnding to "success:met_queen":"teaserqueen">>'})
    assert any(
        "an ending is only its name" in e
        and '<<set $isEnding to "success:met_queen">>' in e
        and '"success:met_queen" in the $meta_endings list' in e
        for e in errors
    ), errors
    # It's still an ending scene: no "dead end without $isEnding" on top.
    assert not any("doesn't set $isEnding" in e for e in errors), errors


def test_an_unreadable_ending_is_refused_not_left_waiting():
    result = _check_twine_syntax(_story({"Won": '<<set $isEnding to "success" ; $x to 1>>'}))
    assert any("Won" in e and "isn't accepted" in e for e in result["errors"]), result["errors"]


# --- every dead end under Retreat is a failure -------------------------------


def test_a_one_scene_retreat_is_a_failure():
    assert _errors({"Retreat": 'You run. <<set $isEnding to "failure">>'}) == []


def test_a_one_scene_retreat_with_a_success_is_refused():
    errors = _errors({"Retreat": 'You run. <<set $isEnding to "success">>'})
    assert any("'Retreat' is an ending of the Retreat story — running away is a failure" in e for e in errors)


def test_a_one_scene_retreat_without_an_ending_is_refused():
    errors = _errors({"Retreat": "You run."})
    assert any("'Retreat' has no outgoing links and doesn't set $isEnding" in e for e in errors)
    assert any("The Retreat story has no ending" in e for e in errors)


def test_every_dead_end_under_retreat_needs_a_failure():
    endings = '<<set $meta_endings to ["success", "failure:lost", "failure:hid"]>>'
    scenes = {
        "Retreat": "[[Hide|Hide]] [[Flee|Flee]] [[Swim|Swim]]",
        "Hide": '<<set $isEnding to "failure:hid">>',
        "Flee": "You get away.",
        "Swim": '<<if $strong>><<set $isEnding to "failure:hid">><<else>><<set $isEnding to "success">><</if>>',
    }
    errors = _errors(scenes, endings=endings)
    assert any("'Flee' has no outgoing links and doesn't set $isEnding" in e for e in errors)
    assert any("'Swim' is an ending of the Retreat story — running away is a failure" in e for e in errors)
    assert not any("'Hide'" in e for e in errors), errors


# --- only the ending scene sets it, when it is shown --------------------------


@pytest.mark.parametrize("scenes", [
    {"Won": '<<link "Claim the crown">><<set $isEnding to "success">><</link>>'},
    {"Won": '<<button "Claim the crown">><<if $gold gt 5>><<set $isEnding to "success">><</if>><</button>>'},
    {"Start": "[[Win|Won][$isEnding to 'success']] [[Lose|Lost]]"},
])
def test_an_ending_is_never_set_by_a_click(scenes):
    errors = _errors(scenes)
    assert any("an ending is set when its scene is shown, never by a click" in e for e in errors), errors


def test_the_platforms_values_are_never_removed():
    for name in ("$isEnding", "$follows", "$meta_title", "$lead"):
        errors = _errors({"Won": f'<<set $isEnding to "success">><<unset {name}>>'})
        assert any("are never removed" in e for e in errors), (name, errors)


def test_unsetting_your_own_variable_stays_a_note():
    result = _check_twine_syntax(_story({"Won": '<<set $isEnding to "success">><<unset $gold>>'}))
    assert result["errors"] == []
    assert [w["kind"] for w in result["findings"]] == [story_rules.NOTE]
