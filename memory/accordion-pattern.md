---
name: accordion-pattern
description: Established accordion visual style and behavior used across storyteller, guide, and characters pages
metadata:
  type: project
---

All accordion sections across the app use the same GuideTable-inspired style:

**Outer accordion** (e.g. Gender / Race / Profession / Story Impact / Classes on characters page):
- CSS classes: `.accordionItem`, `.accordionHeader`, `.accordionChevron`, `.accordionBody`
- Dark `#1a1a1a` header background, `#c07a3a` text, `#3a3020` border, chevron `▾`/`▴` on right in `#7a6a3a`
- Single-open behavior: `useState<string | null>(null)` — one state per accordion group

**Nested sub-accordion** (e.g. race categories, profession categories, genders inside Race/Profession/Gender):
- CSS classes: `.subAccordionItem`, `.subAccordionHeader`, `.subAccordionBody`
- Slightly dimmer: `#111108` bg, `#a89968` text, `#2a2018` border
- Separate `useState<string | null>(null)` per nested group (e.g. `openRaceCategory`, `openProfessionCategory`, `openGender`)

**Content rows inside sub-accordion**:
- CSS classes: `.raceEntry` (reused for races, professions, genders), `.raceName`, `.raceDescription`
- Vertical list: name on top in `#c07a3a`, description below in `#d4c9a8`, separated by `#1e1a10` borders

**Storyteller page** uses `<details>`/`<summary>` with `.group`/`.groupSummary`/`.groupBody` classes (same colors, no JS state needed).

**Why:** User explicitly requested consistent accordion visual language across all pages matching the GuideTable mobile style.
