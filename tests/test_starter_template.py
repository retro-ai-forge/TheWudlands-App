"""The starter template writers download from the top of the tutorial page
(public/downloads/wudlands-starter.twee): the story it imports passes today's
submit check as imported, without an error or a warning - so a rule change
can't leave the template behind."""

import json
import re
import uuid
from pathlib import Path

from backend.auth_routes import _check_twine_syntax
from backend.story_rules import TEMPLATE_TITLE

TEMPLATE = Path(__file__).resolve().parent.parent / "public" / "downloads" / "wudlands-starter.twee"


def _template() -> dict:
    return _story_from_twee(TEMPLATE.read_text(encoding="utf-8"))


def _story_from_twee(source: str) -> dict:
    """The story the editor makes of a .twee file (twinejs-integrated
    src/util/twee.ts storyFromTwee): passages split at '::' lines, the header's
    name, [tags] and {position}, script/stylesheet passages folded into the
    story's own, StoryTitle as its name and StoryData's format and start."""
    header_re = re.compile(r"^::\s*(.*?(?:\\\s)?)\s*(\[.*?\])?\s*(\{.*?\})?\s*$")
    passages = []
    for chunk in re.split(r"^::", source, flags=re.M):
        if not chunk.strip():
            continue
        header, _, text = (":: " + chunk).partition("\n")
        m = header_re.match(header)
        assert m, header
        name, raw_tags, raw_meta = m.groups()
        tags = [t for t in (raw_tags or "[]")[1:-1].split() if t]
        if raw_meta:
            json.loads(raw_meta)  # the editor would warn on bad metadata
        passages.append({"id": str(uuid.uuid4()), "name": name, "tags": tags, "text": text.strip()})

    story = {"name": "", "storyData": {"stylesheet": "", "script": "", "tags": []}, "passages": []}
    for p in passages:
        if "script" in p["tags"] and "stylesheet" not in p["tags"]:
            story["storyData"]["script"] += p["text"] + "\n"
        elif "stylesheet" in p["tags"] and "script" not in p["tags"]:
            story["storyData"]["stylesheet"] += p["text"] + "\n"
        elif p["name"] == "StoryTitle":
            story["name"] = p["text"]
        elif p["name"] == "StoryData":
            data = json.loads(p["text"])
            story["storyData"].update(storyFormat=data["format"], storyFormatVersion=data["format-version"])
            story["_start"] = data["start"]
        else:
            story["passages"].append(p)
    start_name = story.pop("_start")
    start = next(p for p in story["passages"] if p["name"] == start_name)
    story["storyData"]["startPassage"] = start["id"]
    return story


def test_the_template_passes_the_submit_check_once_it_has_a_title():
    # Nothing to add in the editor first (the genres are in StoryInit) but the
    # story's own title: the template's placeholder is refused on purpose.
    story = _template()
    result = _check_twine_syntax(story)
    assert result["errors"] == [
        f'$meta_title is still the template\'s "{TEMPLATE_TITLE}" - give your story its own title'
    ]
    init = next(p for p in story["passages"] if p["name"] == "StoryInit")
    init["text"] = init["text"].replace(f"'{TEMPLATE_TITLE}'", "'The Salt Road'")
    result = _check_twine_syntax(story)
    assert result["errors"] == []
    assert result["warnings"] == []
    assert not result["held"] and not result["hasCode"]


def test_the_refused_placeholder_is_the_templates_title():
    """story_rules.TEMPLATE_TITLE and the template's $meta_title stay the same."""
    assert f"<<set $meta_title to '{TEMPLATE_TITLE}'>>" in TEMPLATE.read_text(encoding="utf-8")


def test_the_template_has_every_required_scene_and_ending():
    story = _template()
    names = {p["name"] for p in story["passages"]}
    assert {"StoryInit", "Start", "Retreat", "LastResort"} <= names
    assert story["name"] == "My Wudlands Story"
    texts = {p["name"]: p["text"] for p in story["passages"]}
    assert '<<set $isEnding to "lastresort">>' in texts["LastResort"]
    assert '<<set $isEnding to "failure' in texts["Retreat"]


def test_the_template_needs_no_picture():
    # Nothing to upload before the first submit: the cover is optional.
    assert "[img[" not in TEMPLATE.read_text(encoding="utf-8").lower()


def test_the_template_lists_two_genres():
    from backend import story_rules
    story = _template()
    rules = story_rules.check_story(story["passages"], story["storyData"])
    assert rules.genres == ["adventure", "island"]


def test_comments_sit_above_the_values():
    """The passage editor is narrow: a comment right of a value wraps onto the
    next line, so every comment has a line of its own."""
    for line in TEMPLATE.read_text(encoding="utf-8").splitlines():
        if "<!--" in line:
            assert line.lstrip().startswith("<!--") and line.rstrip().endswith("-->"), line


def test_the_values_keep_the_writers_order():
    """The order the writers' own template uses: the required values with the
    genres after the author, then the endings, then Run away (fixed)."""
    text = TEMPLATE.read_text(encoding="utf-8")
    init = text[text.index(":: StoryInit"):text.index(":: Start")]
    names = re.findall(r"^<<set \$(\w+)", init, flags=re.M)
    assert names == [
        "meta_title", "meta_description", "meta_author", "meta_genres", "meta_maxCharNum",
        "meta_adventureTier", "meta_durationWeeks", "meta_access", "meta_endings",
        "meta_allowRunAway", "gold",
    ]


def test_the_scenes_sit_where_the_writers_template_has_them():
    text = TEMPLATE.read_text(encoding="utf-8")
    positions = dict(re.findall(r'^:: (\w+) \{"position":"([\d,]+)"', text, flags=re.M))
    assert positions == {
        "StoryInit": "25,25", "Start": "250,100", "Arrival": "400,50",
        "Lost": "400,200", "Retreat": "25,150", "LastResort": "25,275",
    }
