"""
Regenerate public/craft/recipe-viewer.html from
public/craft/recipe-viewer.template.html and the current backend/data/*.json
catalogs + craft-recipes.json.

Run this after editing craft-recipes.json or any base-*.json catalog file so
the viewer reflects the latest data:

    python3 public/craft/build-recipe-viewer.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "backend" / "data"
TEMPLATE = Path(__file__).resolve().parent / "recipe-viewer.template.html"
OUTPUT = Path(__file__).resolve().parent / "recipe-viewer.html"

CATALOG_FILES = {
    "raw": "base-resources.json",
    "processed": "base-processed.json",
    "tool": "base-tools.json",
    "armor": "base-items-armor.json",
    "shield": "base-items-shield.json",
    "weapon": "base-items-weapon.json",
    "food": "base-food.json",
    "potion": "base-potion.json",
    "misc": "base-items-misc.json",
    "adventuring_gear": "base-adventuring-gear.json",
    "blueprint": "base-blueprint.json",
}


def build_families() -> dict:
    families: dict[str, dict] = {}
    for category, filename in CATALOG_FILES.items():
        items = json.loads((DATA_DIR / filename).read_text())
        by_family: dict[str, list[dict]] = {}
        for item in items:
            by_family.setdefault(item["familyId"], []).append(item)
        for family_id, family_items in by_family.items():
            family_items = sorted(family_items, key=lambda x: x["tier"])
            families[family_id] = {
                "category": category,
                "name": family_items[0]["name"],
                "tiers": [
                    {"tier": it["tier"], "name": it["name"], "id": it["id"]}
                    for it in family_items
                ],
            }
    return families


def build_recipes() -> dict:
    recipes = json.loads((DATA_DIR / "craft-recipes.json").read_text())
    return {r["familyId"]: r for r in recipes}


def main() -> None:
    data = {"families": build_families(), "recipes": build_recipes()}
    template = TEMPLATE.read_text()
    output = template.replace("__DATA__", json.dumps(data))
    OUTPUT.write_text(output)
    print(f"Wrote {OUTPUT} ({len(data['families'])} families, {len(data['recipes'])} recipes)")


if __name__ == "__main__":
    main()
