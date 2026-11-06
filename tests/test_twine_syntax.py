"""Unit tests for the Twine story submission syntax checker.

These are pure-function tests (no DB, no network): they exercise
`_check_twine_syntax`, which the submit-for-review endpoint runs to decide
whether a story is accepted.
"""

from backend.auth_routes import (
    _check_twine_syntax,
    _collect_story_tags,
    _count_playable_scenes,
    _link_target,
)


def _story(passages, start="1", fmt="SugarCube", with_retreat=True, tags=("adventure",)):
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
        "storyData": {"startPassage": start, "storyFormat": fmt, "tags": list(tags)},
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
    assert any("uploaded images" in e for e in result["errors"])


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


def test_reserved_passages_exempt_from_structural_rules():
    # PassageHeader has no links and no ending, but must not be flagged.
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
    assert result["errors"] == []
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
