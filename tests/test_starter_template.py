"""The starter template writers download from the top of the tutorial page
(public/downloads/wudlands-starter.twee): the story it imports passes today's
submit check without a warning - only the genre tag is left to the writer, as
a .twee can't carry one - so a rule change can't leave the template behind."""

import json
import re
import uuid
from pathlib import Path

from backend.auth_routes import _check_twine_syntax

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


def test_the_template_passes_the_submit_check_without_a_warning():
    story = _template()
    # What the writer adds in the editor: a genre tag (the .twee can't carry one).
    story["storyData"]["tags"] = ["adventure"]
    result = _check_twine_syntax(story)
    assert result["errors"] == []
    assert result["warnings"] == []
    assert not result["held"] and not result["hasCode"]


def test_the_template_has_every_required_scene_and_ending():
    story = _template()
    names = {p["name"] for p in story["passages"]}
    assert {"StoryInit", "Start", "Retreat", "LastResort"} <= names
    # The library card shows only the name, so it carries the one step left.
    assert story["name"] == "My Wudlands Story - add a genre tag"
    assert "Story > Tags" in {p["name"]: p["text"] for p in story["passages"]}["Start"]
    texts = {p["name"]: p["text"] for p in story["passages"]}
    assert '<<set $isEnding to "lastresort">>' in texts["LastResort"]
    assert '<<set $isEnding to "failure' in texts["Retreat"]


def test_the_template_needs_no_picture():
    # Nothing to upload before the first submit: the cover is optional.
    assert "[img[" not in TEMPLATE.read_text(encoding="utf-8").lower()


def test_without_a_genre_tag_the_check_says_so():
    """The one thing a writer must still do after the import."""
    errors = _check_twine_syntax(_template())["errors"]
    assert len(errors) == 1 and "no genre tag" in errors[0]
