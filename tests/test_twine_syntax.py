"""Unit tests for the Twine story submission syntax checker.

These are pure-function tests (no DB, no network): they exercise
`_check_twine_syntax`, which the submit-for-review endpoint runs to decide
whether a story is accepted.
"""

import json

import pytest

from backend.auth_routes import (
    _check_twine_syntax,
    _collect_story_tags,
    _count_playable_scenes,
    _link_target,
    _without_test_characters,
)


def _story(passages, start="1", fmt="SugarCube", with_retreat=True, tags=("adventure",), version="2.37.3"):
    # Retreat is a required scene (the always-available voluntary-exit ending),
    # injected by default so each test can focus on the rule it exercises. Pass
    # with_retreat=False to omit it (e.g. to test the missing-Retreat error, or
    # a deliberately incomplete story). A story-level tag is included by default
    # (every real story carries at least one); pass tags=() to omit.
    passages = list(passages)
    if with_retreat and not any(p.get("name") == "Retreat" for p in passages):
        passages.append(
            _p("retreat", "Retreat", "You withdraw. <<set $isEnding to true>>")
        )
    return {
        "name": "Probe story",
        "storyData": {
            "startPassage": start, "storyFormat": fmt, "storyFormatVersion": version, "tags": list(tags),
        },
        "passages": passages,
    }


def _p(id, name, text, tags=None):
    return {"id": id, "name": name, "text": text, "tags": tags or []}


# A StoryInit body that initialises every mandatory metadata field, for fixtures
# that expect a clean (error-free) result.
VALID_INIT = (
    "<<set $meta_title to 'Title'>>"
    "<<set $meta_description to 'Desc'>>"
    "<<set $meta_author to 'Auth'>>"
    "<<set $meta_maxCharNum to 1>>"
    "<<set $meta_adventureTier to 1>>"
    "<<set $meta_durationWeeks to 1>>"
    "<<set $meta_access to 'paid'>>"
    "<<set $meta_allowRunAway to true>>"
    "[img[cover.webp]]"
)


# --- link target parsing -----------------------------------------------------


def test_link_target_all_forms():
    assert _link_target("Target") == "Target"
    assert _link_target("Display|Target") == "Target"
    assert _link_target("Display->Target") == "Target"
    assert _link_target("Target<-Display") == "Target"
    assert _link_target("Display|Target][$x to 1") == "Target"


# --- happy path --------------------------------------------------------------


def test_valid_story_passes():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "Welcome [[End]]"),
                _p("2", "End", "The end. <<set $isEnding to true>>"),
                _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []
    assert result["warnings"] == []


def test_display_and_arrow_links_resolve():
    # Links written with |, -> and <- must all resolve without "does not exist".
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Go east->East]] [[West<-Go west]] [[Label|North]]"),
                _p("2", "East", "<<set $isEnding to true>>"),
                _p("3", "West", "<<set $isEnding to true>>"),
                _p("4", "North", "<<set $isEnding to true>>"),
                _p("5", "LastResort", "You are lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []


# --- format / structure ------------------------------------------------------


def test_non_sugarcube_rejected():
    result = _check_twine_syntax(
        _story([_p("1", "Start", "<<set $isEnding to true>>")], fmt="Harlowe")
    )
    assert any("SugarCube" in e for e in result["errors"])


def test_missing_story_init():
    result = _check_twine_syntax(
        _story([_p("1", "Start", "<<set $isEnding to true>>")])
    )
    assert any("StoryInit" in e for e in result["errors"])


def test_missing_LastResort():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
            ]
        )
    )
    assert any("LastResort" in e for e in result["errors"])


def test_missing_Retreat():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ],
            with_retreat=False,
        )
    )
    assert any("Retreat" in e for e in result["errors"])


def test_LastResort_must_mark_run_not_counted():
    # A LastResort without <<set $isEnding to false>> would wrongly charge the
    # player for a platform fault.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "The tunnel collapses."),
            ]
        )
    )
    assert any("LastResort" in e and "false" in e for e in result["errors"])


def test_LastResort_is_not_flagged_unreachable():
    # LastResort is reached on a fault, not via a link, so it must not warn.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []
    assert not any("unreachable" in w.lower() for w in result["warnings"])


def test_missing_start_passage():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "<<set $isEnding to true>>"),
            ],
            start="",
        )
    )
    assert any("start passage" in e.lower() for e in result["errors"])


def test_duplicate_names():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Dup]]"),
                _p("2", "Dup", "<<set $isEnding to true>>"),
                _p("3", "Dup", "also"),
            ]
        )
    )
    assert any("Duplicate" in e for e in result["errors"])


def test_missing_required_metadata_field():
    # StoryInit sets everything except $meta_durationWeeks.
    partial_init = VALID_INIT.replace("<<set $meta_durationWeeks to 1>>", "")
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", partial_init),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("durationWeeks" in e for e in result["errors"])


def _init_with(replacement_from: str, replacement_to: str) -> str:
    """VALID_INIT with one <<set>> line swapped, for range-bound fixtures."""
    assert replacement_from in VALID_INIT, f"fixture did not contain {replacement_from!r}"
    return VALID_INIT.replace(replacement_from, replacement_to)


def _check_init(init_text: str) -> dict:
    return _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", init_text),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )


def test_access_accepts_free_trial_paid():
    for ok in ("free", "trial", "paid"):
        init = _init_with("<<set $meta_access to 'paid'>>", f"<<set $meta_access to '{ok}'>>")
        result = _check_init(init)
        assert not any("meta_access" in e for e in result["errors"]), f"{ok} should be accepted"


def test_access_accepts_single_or_double_quotes():
    for quoted in ("'trial'", '"trial"'):
        init = _init_with("<<set $meta_access to 'paid'>>", f"<<set $meta_access to {quoted}>>")
        result = _check_init(init)
        assert not any("meta_access" in e for e in result["errors"]), f"{quoted} should be accepted"


def test_access_must_be_quoted():
    # Unquoted, SugarCube reads `trial` as an undefined variable and StoryInit
    # breaks in play, so submit must refuse it even though the word is valid.
    init = _init_with("<<set $meta_access to 'paid'>>", "<<set $meta_access to trial>>")
    result = _check_init(init)
    assert any("meta_access" in e and "quoted" in e for e in result["errors"])


def test_access_rejects_unknown_value():
    for bad in ("'premium'", "'Paid'", "3"):
        init = _init_with("<<set $meta_access to 'paid'>>", f"<<set $meta_access to {bad}>>")
        result = _check_init(init)
        assert any("meta_access" in e for e in result["errors"]), f"{bad} should be rejected"


def test_access_is_required():
    init = _init_with("<<set $meta_access to 'paid'>>", "")
    result = _check_init(init)
    assert any("meta_access" in e for e in result["errors"])


def test_adventure_tier_out_of_range_rejected():
    for bad in ("0", "7"):
        init = _init_with("<<set $meta_adventureTier to 1>>", f"<<set $meta_adventureTier to {bad}>>")
        result = _check_init(init)
        assert any("adventureTier" in e for e in result["errors"]), f"tier {bad} should be rejected"


def test_adventure_tier_in_range_accepted():
    for ok in ("1", "6"):
        init = _init_with("<<set $meta_adventureTier to 1>>", f"<<set $meta_adventureTier to {ok}>>")
        result = _check_init(init)
        assert not any("adventureTier" in e for e in result["errors"]), f"tier {ok} should be accepted"


def test_max_char_num_out_of_range_rejected():
    for bad in ("0", "5"):
        init = _init_with("<<set $meta_maxCharNum to 1>>", f"<<set $meta_maxCharNum to {bad}>>")
        result = _check_init(init)
        assert any("maxCharNum" in e for e in result["errors"]), f"maxCharNum {bad} should be rejected"


def test_max_char_num_in_range_accepted():
    for ok in ("1", "4"):
        init = _init_with("<<set $meta_maxCharNum to 1>>", f"<<set $meta_maxCharNum to {ok}>>")
        result = _check_init(init)
        assert not any("maxCharNum" in e for e in result["errors"]), f"maxCharNum {ok} should be accepted"


def test_string_meta_blank_rejected():
    # Empty and whitespace-only values are invalid for a title.
    for bad in ("''", "'  '"):
        init = _init_with("<<set $meta_title to 'Title'>>", f"<<set $meta_title to {bad}>>")
        result = _check_init(init)
        assert any("meta_title" in e for e in result["errors"]), f"title {bad} should be rejected"


def test_string_meta_valid_accepted():
    # A single letter, a quoted number, and ordinary text are all fine, in
    # either quote style.
    for ok in ("'A'", "'4'", "'Hi'", "'The Long Road'", '"Double Quoted"'):
        init = _init_with("<<set $meta_title to 'Title'>>", f"<<set $meta_title to {ok}>>")
        result = _check_init(init)
        assert not any("meta_title" in e for e in result["errors"]), f"title {ok} should be accepted"


def test_text_meta_must_be_quoted():
    # Unquoted, SugarCube evaluates the value as JavaScript: a bare word is an
    # undefined variable (StoryInit breaks in play), a bare number isn't text.
    fields = {
        "meta_title": "'Title'",
        "meta_description": "'Desc'",
        "meta_author": "'Auth'",
        "meta_access": "'paid'",
    }
    for var, good in fields.items():
        for bad in ("Word", "4", "'mismatched\""):
            init = _init_with(f"<<set ${var} to {good}>>", f"<<set ${var} to {bad}>>")
            result = _check_init(init)
            assert any(var in e and "quoted" in e for e in result["errors"]), f"${var} to {bad}"


def test_numeric_and_boolean_meta_stay_unquoted():
    # The quote rule is only for text fields; VALID_INIT's bare numbers and
    # true must not trip it.
    result = _check_init(VALID_INIT)
    assert not any("quoted" in e for e in result["errors"])


def test_story_init_needs_a_cover_image():
    init = VALID_INIT.replace("[img[cover.webp]]", "")
    result = _check_init(init)
    assert any("cover image" in e for e in result["errors"])


def test_story_init_cover_accepted():
    result = _check_init(VALID_INIT)
    assert not any("cover" in e or "image" in e for e in result["errors"])


def test_story_init_only_one_cover():
    result = _check_init(VALID_INIT + "[img[second.webp]]")
    assert any("exactly one image" in e for e in result["errors"])


def test_story_init_cover_must_be_uploaded_not_a_url():
    init = VALID_INIT.replace("[img[cover.webp]]", "[img[https://example.com/c.png]]")
    result = _check_init(init)
    assert any("plain file name" in e for e in result["errors"])


def test_story_cover_is_the_story_init_image():
    from backend.auth_routes import _story_cover
    passages = [
        {"name": "Start", "text": "[img[scene.webp]]"},
        {"name": "StoryInit", "text": "<<set $x to 1>>\n[img[cover.webp]]"},
    ]
    assert _story_cover(passages) == "cover.webp"
    assert _story_cover([{"name": "StoryInit", "text": "no image"}]) is None


# --- StoryInit special rules -------------------------------------------------


def test_story_init_may_not_link():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", "[[Start]]"),
                _p("1", "Start", "<<set $isEnding to true>>"),
            ]
        )
    )
    assert any("StoryInit must not have outgoing links" in e for e in result["errors"])


def test_story_init_may_not_be_ending():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", "<<set $isEnding to true>>"),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
            ]
        )
    )
    assert any("StoryInit must not contain" in e for e in result["errors"])


# --- endings & reachability --------------------------------------------------


def test_story_needs_an_ending():
    # Two passages linking to each other forever, no ending declared. Omit the
    # auto Retreat (which is itself an ending) so the no-ending rule is exercised.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "[[Start]]"),
            ],
            with_retreat=False,
        )
    )
    assert any("no ending" in e.lower() for e in result["errors"])


def test_terminal_node_without_ending_errors():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Dead]]"),
                _p("2", "Dead", "nothing here"),
            ]
        )
    )
    assert any("no outgoing links" in e for e in result["errors"])


def test_unreachable_node_warns_not_errors():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "You slip away. <<set $isEnding to false>>"),
                _p("9", "Orphan", "<<set $isEnding to true>>"),
            ]
        )
    )
    assert result["errors"] == []
    assert any("unreachable" in w.lower() for w in result["warnings"])


def test_broken_link_errors():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Nowhere]]"),
            ]
        )
    )
    assert any("Nowhere" in e and "does not exist" in e for e in result["errors"])


# --- scene count & tags ------------------------------------------------------


def test_count_playable_scenes_excludes_non_playable():
    passages = [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", "[[End]]"),
        _p("2", "End", "<<set $isEnding to true>>"),
        _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
        _p("4", "PassageHeader", "<<if true>>hi<</if>>"),
        _p("5", "Story Stylesheet", "body { color: red; }", tags=["stylesheet"]),
        _p("6", "Story JavaScript", "console.log(1)", tags=["script"]),
    ]
    # Only Start and End are playable scenes.
    assert _count_playable_scenes(passages) == 2


def test_collect_story_tags_distinct_sorted_no_engine_tags():
    doc = {
        "passages": [
            _p("1", "Start", "[[End]]", tags=["forest", "combat"]),
            _p("2", "End", "<<set $isEnding to true>>", tags=["combat"]),
            _p("3", "Story Stylesheet", "", tags=["stylesheet"]),
        ]
    }
    assert _collect_story_tags(doc) == ["combat", "forest"]


def test_collect_story_tags_includes_story_level_tags():
    # Story-level tags (the Twine Story's own `tags`) are combined with passage
    # tags; engine tags are still excluded.
    doc = {
        "tags": ["romance", "magic", "script"],
        "passages": [_p("1", "Start", "<<set $isEnding to true>>", tags=["combat"])],
    }
    assert _collect_story_tags(doc) == ["combat", "magic", "romance"]


# --- reserved passages are exempt --------------------------------------------


def test_sugarcube_special_passages_are_refused_without_structural_noise():
    # PassageHeader would run on every scene: refused by the story rules, and
    # not also reported as a dead end or an unreachable scene.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "The path gives way. <<set $isEnding to false>>"),
                _p("4", "PassageHeader", "<<if $hp lte 0>>You died.<</if>>"),
            ]
        )
    )
    assert result["errors"] == [
        "Passage 'PassageHeader' isn't accepted - StoryInit, Retreat and LastResort are the only special scenes"
    ]
    assert not any("PassageHeader" in w for w in result["warnings"])


# --- image hotspots (<<area>> macros) ----------------------------------------


def test_area_hotspot_valid_and_counts_as_link():
    # A scene whose only exits are hotspots must pass: the [[links]] inside
    # <<area>> count as outgoing edges, so it is not a terminal node, and its
    # targets are resolved like any other link.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p(
                    "1",
                    "Start",
                    "[img[gate.webp]]\n"
                    "<<area 0.00 0.20 0.45 0.80 [[The left door->LeftDoor]]>>\n"
                    "<<area 0.55 0.20 0.45 0.80 [[Climb the wall->WallTop]]>>",
                ),
                _p("2", "LeftDoor", "<<set $isEnding to true>>"),
                _p("3", "WallTop", "<<set $isEnding to true>>"),
                _p("4", "LastResort", "You slip. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []
    assert result["warnings"] == []


def test_area_hotspot_missing_target_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[g.webp]]\n<<area 0 0 0.5 1 [[Go->Nowhere]]>>"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("Nowhere" in e and "does not exist" in e for e in result["errors"])


def test_area_hotspot_out_of_range_coords_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[g.webp]]\n<<area 0 0 1.5 1 [[Go->End]]>>"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("between 0 and 1" in e for e in result["errors"])


def test_area_hotspot_wrong_coord_count_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[g.webp]]\n<<area 0 0 0.5 [[Go->End]]>>"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("4 numbers" in e for e in result["errors"])


def test_area_hotspot_overflow_warns():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[g.webp]]\n<<area 0.6 0 0.6 1 [[Go->End]]>>"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []
    assert any("past the image edge" in w for w in result["warnings"])


def test_ending_node_with_outgoing_links_rejected():
    # A node that marks itself an ending must be terminal; if it still links
    # onward, the ending macro has to be removed.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "Done. <<set $isEnding to true>> [[Start]]"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any(
        "marked as an ending but has outgoing links" in e for e in result["errors"]
    )


def test_ending_node_terminal_passes():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "Done. <<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []


def test_area_hotspot_without_image_rejected():
    # A hotspot needs an image to overlay; <<area>> in an imageless scene errors.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "No picture here. <<area 0 0 0.5 1 [[End]]>>"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any(
        "hotspots but no image" in e for e in result["errors"]
    )


# --- image reference collection ----------------------------------------------


def test_collect_image_refs_forms_and_external():
    from backend.auth_routes import _collect_image_refs

    refs = _collect_image_refs(
        [
            {"text": "[img[gate.webp]] [[End]]"},
            {"text": "[img[Title|cave.jpg]] and [img[a.webp][Next]]"},
            {"text": "[img[https://x/y.png]] [img[data:abc]]"},
            {"text": "no image"},
        ]
    )
    assert refs == {"gate.webp", "cave.jpg", "a.webp"}


# --- image-link navigation [img[src][passage]] -------------------------------


def test_image_link_counts_as_exit_and_needs_no_ending():
    # A scene whose only way out is an image-link is not a dead end, so it does
    # not need an ending macro, and its target is resolved like any link.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[gate.webp][End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []


def test_image_link_missing_target_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[img[gate.webp][Nowhere]] [[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("Nowhere" in e and "does not exist" in e for e in result["errors"])


def test_external_link_rejected():
    # External URLs are not scenes; both [[...]] and image-links reject them.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[https://example.com]] [img[g.webp][http://x.io]] [[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    external = [e for e in result["errors"] if "external links are not allowed" in e]
    assert len(external) == 2


def test_external_link_forms_without_scheme_colon_slashes_rejected():
    # Any URL shape is caught: protocol-relative, bare scheme, and www. host.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p(
                    "1",
                    "Start",
                    "[[//cdn.example.com]] [[mailto:a@b.com]] [[www.example.com]] [[End]]",
                ),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    external = [e for e in result["errors"] if "external links are not allowed" in e]
    assert len(external) == 3


# --- independent Start / Retreat graphs + isolated LastResort ----------------


def test_lastresort_with_outgoing_link_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>> [[Start]]"),
            ]
        )
    )
    assert any(
        "LastResort must not have outgoing links" in e for e in result["errors"]
    )


def test_link_to_lastresort_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]] [[LastResort]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert any("Nothing may link to LastResort" in e for e in result["errors"])


def test_start_linking_into_retreat_breaks_independence():
    # The main story linking into the Retreat graph makes them interconnect.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]] [[Retreat]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
                _p("4", "Retreat", "Withdraw. <<set $isEnding to true>>"),
            ]
        )
    )
    assert any(
        "independent graphs" in e and "Retreat" in e for e in result["errors"]
    )


def test_retreat_may_loop_back_to_itself():
    # A branch returning to the Retreat root is a link within the Retreat graph,
    # which is allowed; the graph still reaches an ending elsewhere.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
                _p("4", "Retreat", "[[RA]]"),
                _p("5", "RA", "Back out? [[Retreat]] or [[REnd]]"),
                _p("6", "REnd", "You leave for good. <<set $isEnding to true>>"),
            ]
        )
    )
    assert result["errors"] == []


def test_start_may_loop_back_to_itself():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Start]] [[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ]
        )
    )
    assert result["errors"] == []


def test_retreat_graph_needs_its_own_ending():
    # Main story ends fine, but the Retreat graph loops forever with no ending.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
                _p("4", "Retreat", "[[RA]]"),
                _p("5", "RA", "[[RB]]"),
                _p("6", "RB", "[[RA]]"),
            ]
        )
    )
    assert any("Retreat story has no ending" in e for e in result["errors"])


def test_retreat_graph_with_ending_passes():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
                _p("4", "Retreat", "[[RA]]"),
                _p("5", "RA", "You give up. <<set $isEnding to true>>"),
            ]
        )
    )
    assert result["errors"] == []


def test_start_and_retreat_must_be_independent():
    # Both the main story and Retreat reach the same scene — not allowed.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[Shared]]"),
                _p("2", "Shared", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
                _p("4", "Retreat", "[[Shared]]"),
            ]
        )
    )
    assert any(
        "independent graphs" in e and "Shared" in e for e in result["errors"]
    )


def test_story_without_tags_rejected():
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]"),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ],
            tags=(),
        )
    )
    assert any("no tags" in e.lower() for e in result["errors"])


def test_story_with_passage_tag_only_passes_tag_rule():
    # A tag on any passage satisfies the rule, even with no story-level tags.
    result = _check_twine_syntax(
        _story(
            [
                _p("0", "StoryInit", VALID_INIT),
                _p("1", "Start", "[[End]]", tags=["combat"]),
                _p("2", "End", "<<set $isEnding to true>>"),
                _p("3", "LastResort", "Lost. <<set $isEnding to false>>"),
            ],
            tags=(),
        )
    )
    assert not any("no tags" in e.lower() for e in result["errors"])


# --- TestCharacters: the editor-only test party -----------------------------


_TEST_PARTY = json.dumps([{
    "firstName": "Grimjaw", "lastName": "Ironfoot", "race": "dwarf", "gender": "m",
    "birthsign": "grit_stitch_brand",
    "might": 18, "agility": 9, "endurance": 17, "precision": 10,
    "will": 11, "insight": 8, "lore": 6, "presence": 7,
    "class1": "none", "classLvl1": 0, "class2": "none", "classLvl2": 0,
    "prof1": "blacksmith", "profLvl1": 3, "prof2": "miner", "profLvl2": 2, "prof3": "none", "profLvl3": 0,
    "equipment": ["warhammer_1", "rope_1"],
}])


def _with_test_party(start_text: str = "Welcome [[End]]"):
    return [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", start_text),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
        _p("9", "TestCharacters", _TEST_PARTY),
    ]


def test_test_characters_needs_no_link_ending_or_visit():
    # Not a scene: no outgoing links, no $isEnding, reached by nothing - and
    # none of that is reported.
    result = _check_twine_syntax(_story(_with_test_party()))
    assert result["errors"] == []
    assert result["warnings"] == []


@pytest.mark.parametrize(
    "lead",
    [
        "[[TestCharacters]]",
        "[[Party|TestCharacters]]",
        "[[Party->TestCharacters]]",
        "[img[cover.webp][TestCharacters]]",
        "<<area 0.1 0.1 0.2 0.2 [[TestCharacters]]>>",
        '<<button "Party" "TestCharacters">><</button>>',
        '<<link "Party">><<goto "TestCharacters">><</link>>',
    ],
)
def test_no_scene_may_lead_to_test_characters(lead):
    result = _check_twine_syntax(_story(_with_test_party(f"Welcome [[End]] {lead}")))
    assert any(e.startswith("Passage 'Start' leads to TestCharacters") for e in result["errors"]), result["errors"]


def test_a_submitted_story_keeps_no_test_characters():
    passages = _with_test_party()
    kept = _without_test_characters(passages)
    assert [p["name"] for p in kept] == ["StoryInit", "Start", "End", "LastResort"]
    assert _count_playable_scenes(passages) == _count_playable_scenes(kept) == 2


# --- image file names --------------------------------------------------------


def _scene_errors(text, tags=None):
    passages = [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", text + " [[End]]", tags),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
    ]
    return _check_twine_syntax(_story(passages))["errors"]


@pytest.mark.parametrize(
    "image",
    [
        "[img[gate.webp]]",
        "[img[Gate_2-night.png]]",
        "[img[old_map.jpg][End]]",
        "[<img[gate.webp]]",
        "<<if $x>>[img[gate.webp]]<<else>>[img[gate_open.webp]]<</if>>",
    ],
)
def test_plain_uploaded_image_names_are_accepted(image):
    assert not any("image" in e.lower() or "picture" in e for e in _scene_errors(image))


@pytest.mark.parametrize(
    "image",
    [
        "[img[https://example.com/a.png]]",
        "[img[//example.com/a.png]]",
        "[img[data:image/png;base64,AAAA]]",
        "[img[images/gate.webp]]",
        "[img[../gate.webp]]",
        "[img[C:\\gate.webp]]",
        "[img[$picture]]",
        "[img[_picture]]",
        "[img[gate]]",
        "[img[gate.gif]]",
        "[img[gate.webp.svg]]",
        "[img[gate.webp?x=1]]",
        "[img[alert(1)]]",
        "[img[ gate .webp]]",
        "[IMG[https://example.com/a.png]]",
        "[>img[https://example.com/a.png]]",
    ],
)
def test_image_must_be_a_plain_file_name(image):
    assert any("plain file name" in e for e in _scene_errors(image))


def test_image_tooltip_is_refused():
    # SugarCube runs the tooltip text as JavaScript, like the source.
    errors = _scene_errors("[img[A gate|gate.webp]]")
    assert any("tooltip" in e and "[img[gate.webp]]" in e for e in errors)


@pytest.mark.parametrize(
    "markup",
    [
        '<img src="https://example.com/a.png">',
        "<IMG SRC=x.png>",
        '<svg><image href="https://example.com/a.png"/></svg>',
        '<picture><source srcset="https://example.com/a.webp"></picture>',
        '<div style="background-image: url(https://example.com/a.png)">x</div>',
        "<video poster=a.png></video>",
        '<link rel="stylesheet" href="https://example.com/x.css">',
        "@import 'https://example.com/x.css';",
    ],
)
def test_no_other_way_to_load_a_picture(markup):
    assert any("outside the story" in e for e in _scene_errors(markup))


def test_link_macro_is_not_mistaken_for_a_link_tag():
    assert not any("outside the story" in e for e in _scene_errors('<<link "Go" "End">><</link>>'))


def test_stylesheet_may_not_load_pictures():
    passages = [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", "Welcome [[End]]"),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
    ]
    doc = _story(passages)
    doc["storyData"]["stylesheet"] = "body { background: url('https://example.com/bg.png'); }"
    errors = _check_twine_syntax(doc)["errors"]
    assert any("Story Stylesheet" in e and "outside the story" in e for e in errors)


@pytest.mark.parametrize("tag", ["stylesheet", "Stylesheet"])
@pytest.mark.parametrize("trap", ["[[alert(1)|End]]", "[[Go on|End][$x to alert(1)]]"])
def test_code_in_a_stylesheet_scene_is_refused(tag, trap):
    # SugarCube plays a stylesheet-tagged passage as an ordinary scene in a
    # Twine 2 story, so a scene leading there must not slip code past the check.
    passages = [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", "A dark cave. [[Look closer|Trap]] [[End]]"),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
        _p("4", "Trap", trap, [tag]),
    ]
    errors = _check_twine_syntax(_story(passages))["errors"]
    assert any(e.startswith(f"Passage 'Trap' is tagged {tag}") for e in errors), errors


def test_no_scene_may_stand_in_for_an_image():
    errors = _scene_errors("Welcome", tags=["Twine.image"])
    assert any("Twine.image" in e for e in errors)


def test_test_characters_is_not_checked_for_images():
    # Data, not a scene: the image rules don't read it (the party check does).
    passages = _with_test_party()
    passages[-1] = _p("9", "TestCharacters", '[{"firstName": "Grimjaw", "lastName": "Ironfoot", "note": "url(x)"}]')
    errors = _check_twine_syntax(_story(passages))["errors"]
    assert errors and all(e.startswith("TestCharacters") for e in errors)


def test_upper_case_image_link_is_a_step():
    from backend.twine_graph import passage_links
    assert "End" in passage_links("[IMG[gate.webp][End]]")


@pytest.mark.parametrize(
    "uploaded, ext",
    [("my.photo.png", ".png"), ("../../etc/gate.webp", ".webp"), ("Night Gate (2).JPG", ".jpg"),
     ("...", ".png"), ("$x.webp", ".webp"), ("alert(1).png", ".png")],
)
def test_every_upload_gets_a_name_the_check_accepts(uploaded, ext):
    # Mirrors upload_twine_story_image: the sanitized stem plus the content type's extension.
    import os
    from backend import twine_images
    from backend.auth_routes import _IMAGE_FILENAME_RE
    stem, _ = os.path.splitext(twine_images.sanitize_filename(uploaded))
    assert _IMAGE_FILENAME_RE.fullmatch(stem + ext), stem + ext


def _with_story_data(**story_data):
    story = _story([
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", "Welcome [[End]]"),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
    ])
    story["storyData"].update(story_data)
    return _check_twine_syntax(story)["errors"]


def test_editor_stylesheet_may_not_load_pictures():
    errors = _with_story_data(stylesheet=".passage { background: url(https://example.com/bg.png); }")
    assert any("Story Stylesheet" in e and "outside the story" in e for e in errors)


def test_editor_stylesheet_without_urls_is_fine():
    assert _with_story_data(stylesheet=".stack { display: grid; }\n.stack > * { grid-area: 1 / 1; }") == []


def test_story_javascript_must_be_empty():
    errors = _with_story_data(script="Config.ui.stowBarInitially = true;")
    assert any("Story JavaScript must be empty" in e for e in errors)
    assert _with_story_data(script="  \n ") == []


# --- story name and story data shape -------------------------------------------


def _minimal_passages(start_text="Welcome [[End]]", start_tags=None):
    return [
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", start_text, start_tags),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
    ]


@pytest.mark.parametrize("name", ["The Cave", "Grimjaw's Last Stand: Part 2", "Élan, à la mode!"])
def test_plain_story_names_are_accepted(name):
    doc = {**_story(_minimal_passages()), "name": name}
    assert _check_twine_syntax(doc)["errors"] == []


@pytest.mark.parametrize(
    "name, expected",
    [
        # SugarCube shows the decoded name in its UI bar as markup: this ran.
        ("</title><script>alert(1)</script>", "plain words"),
        ("[[alert(1)|End]]", "plain words"),
        ("Probe\\", "plain words"),  # a backslash breaks SugarCube's start
        ("Probe\nx", "plain words"),  # so does a line break
        ("$x", "plain words"),
        ("", "needs a name"),
        ("   ", "needs a name"),
        (None, "needs a name"),
        ("x" * 101, "longer than 100"),
    ],
)
def test_story_names_that_could_read_as_code_are_refused(name, expected):
    doc = {**_story(_minimal_passages()), "name": name}
    errors = _check_twine_syntax(doc)["errors"]
    assert any(expected in e for e in errors), errors


@pytest.mark.parametrize(
    "story_data, expected",
    [
        ({"script": []}, "script must be text"),
        ({"script": {}}, "script must be text"),
        ({"stylesheet": {}}, "stylesheet must be text"),
        ({"stylesheet": ["a"]}, "stylesheet must be text"),
        ({"tags": "probe"}, "tags must be a list"),
        ({"tags": [1]}, "tags must be a list"),
        ({"tagColors": {"probe": ["red"]}}, "tag colours"),
        ({"zoom": "1"}, "zoom must be a number"),
        ({"zoom": True}, "zoom must be a number"),
        ({"snapToGrid": "yes"}, "snapToGrid"),
        ({"tags": ["dark forest"]}, "without spaces"),
    ],
)
def test_story_data_of_the_wrong_kind_is_refused(story_data, expected):
    doc = _story(_minimal_passages())
    doc["storyData"].update(story_data)
    errors = _check_twine_syntax(doc)["errors"]
    assert any(expected in e for e in errors), errors


@pytest.mark.parametrize("tag", ["x widget", "x init", "a\tTwine.image", "x stylesheet"])
def test_passage_tags_with_spaces_are_refused(tag):
    # One tag "x widget" reaches SugarCube as the tags x and widget.
    doc = _story(_minimal_passages(start_tags=[tag]))
    errors = _check_twine_syntax(doc)["errors"]
    assert any("without spaces" in e for e in errors), errors


# --- Ways on that commands write -------------------------------------------
# A button's quoted destination, <<goto>> in a button or link, and every scene
# of a random jump are exits like [[links]]: the scene isn't a dead end, the
# scenes they reach aren't unreachable, and the step graph allows the step.

_END = "<<set $isEnding to true>>The end."


@pytest.mark.parametrize(
    "start_text, reached",
    [
        ('<<button "Go to the cave" "Cave">><</button>>', ["Cave"]),
        ('<<button "Go">><<goto "Cave">><</button>>', ["Cave"]),
        ('<<link "Go">><<set $x to 1>><<goto "Cave">><</link>>', ["Cave"]),
        ('<<button "Run for it">><<goto `either("Cave", "Mill")`>><</button>>', ["Cave", "Mill"]),
        ('<<button "Turn the page">><<goto `"Page" + random(1, 3)`>><</button>>', ["Page1", "Page2", "Page3"]),
    ],
)
def test_ways_on_written_by_commands_count_as_exits(start_text, reached):
    from backend.twine_graph import build_story_graph, step_allowed

    passages = [_p("1", "Start", start_text)] + [
        _p(str(i + 2), name, _END) for i, name in enumerate(reached)
    ]
    story = _story(passages)
    result = _check_twine_syntax(story)
    structure = [
        e for e in result["errors"]
        if "no outgoing links" in e or "has no ending" in e or "does not exist" in e
    ]
    assert structure == [], structure
    assert not [w for w in result["warnings"] if "unreachable" in w], result["warnings"]

    graph = build_story_graph(story["passages"], story["storyData"])
    assert graph["links"]["Start"] == reached
    assert all(step_allowed(graph, "Start", name) for name in reached)
    assert all(graph["endings"].get(name) == "finished" for name in reached)
    assert not step_allowed(graph, "Start", "Nowhere")


def test_visited_only_reads_and_is_no_exit():
    from backend.twine_graph import build_story_graph

    story = _story([
        _p("1", "Start", '<<if visited("Cave")>>Back again.<</if>>[[Cave]]'),
        _p("2", "Cave", _END),
        _p("3", "Hidden", _END),
    ])
    graph = build_story_graph(story["passages"], story["storyData"])
    assert graph["links"]["Start"] == ["Cave"]
