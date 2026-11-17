# Story Rules

> **Draft.** These rules are not enforced yet. The automatic story check will refuse anything that is not described here, and tell you the scene, the line and an accepted form to use instead.

Stories run on the Wudlands server, not in the player's browser. The player only receives the finished scene: text, images and buttons. These rules keep it that way: a story can tell its tale, keep track of things and react to the characters, but it can't run its own program code, reach outside the story or show players anything the platform didn't check.

Everything in "Accepted forms" below has been tested in SugarCube 2.37.3, the story format the editor uses.

## What a story may contain

- Scene text, with a little HTML for layout (see "HTML").
- Images from the story's own image list, and clickable areas on them.
- Links and buttons to other scenes.
- Choices from fixed options: radio buttons, checkboxes, drop-downs and cycling options.
- Story variables: numbers, true/false, short texts, and lists defined in `StoryInit`.
- Conditions, simple maths and dice.
- The characters' names and values, read only.
- Legend changes and endings.

Not allowed anywhere: JavaScript, commands that aren't listed here, text input from players, references to the story engine's internals (such as `Config`, `State`, `Engine`, `setup`, `window` or `document`), destinations built from variables, and links, images or styles that load anything from outside the story.

## Characters

The server puts the playing characters into every scene. They are read only: a story never sets or changes them.

| Variable | What it holds |
|---|---|
| `$char` | All characters in marching order: `$char[0]`, `$char[1]`, ... |
| `$char.length` | Party size, 1 to 4 |
| `$lead` | The party lead (same values as one `$char` entry) |

Each character has these values:

| Kind | Values |
|---|---|
| **Names** (typed by players) | `firstName`, `lastName`, `name` (both together) |
| **Fixed lists** | `race`, `gender`, `birthsign`, `class1`, `class2`, `prof1`, `prof2`, `prof3` (`"none"` when empty) |
| **Numbers** | `might`, `agility`, `endurance`, `precision`, `will`, `insight`, `lore`, `presence`, `classLvl1`, `classLvl2`, `profLvl1`, `profLvl2`, `profLvl3` |
| **Equipment** | `equipment`: the items the character carries, as item IDs with a tier, such as `"rope_1"` or `"pickaxe_2"` |

**How each kind may be used:**

1. **Names only appear in scene text.** Print them on their own, never inside another command, condition, link, button or piece of text being put together.
2. **Fixed-list values** may be printed and compared with a quoted value.
3. **Numbers** may be printed, compared and used in maths.
4. **Equipment** may be checked with `.includes("item_tier")`. The tier is the lowest one that counts: `"candle_1"` means a candle of tier 1 or better, `"pickaxe_2"` a pickaxe of tier 2 or better. The item ID must exist.
5. **Nothing** may be set, changed or removed, and `StoryInit` never contains character data.

Accepted:

```
<<print $lead.firstName>> draws her sword.
$lead.firstName draws her sword.
<<print $char[1].name>> keeps watch.
<<if $lead.might gte 6>>You force the door open.<</if>>
<<if $lead["might"] + $lead["endurance"] gte 12>>The boulder rolls aside.<</if>>
<<if $lead.class1 is "warrior">>The guard salutes you.<</if>>
```

Not accepted:

```
<<set $greeting to "Hello " + $lead.firstName>>   (a name inside a command)
<<if $lead.firstName is "Grimjaw">>               (a name in a condition)
[[Ask $lead.firstName|Tavern]]                     (a name in a link)
<<set $lead.might to 10>>                          (characters are read only)
<<set $char to [...]>>                             (characters are read only)
```

**The whole party** - loop over `$char` with `<<for ... range>>`:

```
<<set _total to 0>>
<<for _i, _c range $char>><<set _total to _total + _c.might>><</for>>
<<if _total gte 15>>Together you push the boulder aside.<</if>>

<<for _i, _c range $char>>
  <<if _c.agility gte 5>>_c.firstName leaps across.<<else>>_c.firstName stumbles but makes it.<</if>>
<</for>>
```

`range $char` is the only loop: it always ends.

**Equipment:**

```
<<if $lead.equipment.includes("rope_1")>>You climb down on your rope.<</if>>
<<if $lead.equipment.includes("pickaxe_2")>>Your pickaxe bites into the hard rock.<</if>>
```

### Test characters

To try a story in the editor with characters, add a scene called `TestCharacters` with up to 4 characters as a plain list (JSON), leader first. The editor's Test puts them into `$char` and `$lead`. When you submit, this scene is removed and never stored: in a real adventure, the server brings in the players' characters instead.

```
[
  {"firstName": "Grimjaw", "lastName": "Ironfoot", "race": "dwarf", "gender": "m", "birthsign": "grit_stitch_brand",
   "might": 18, "agility": 9, "endurance": 17, "precision": 10,
   "will": 11, "insight": 8, "lore": 6, "presence": 7,
   "class1": "none", "classLvl1": 0, "class2": "none", "classLvl2": 0,
   "prof1": "blacksmith", "profLvl1": 3, "prof2": "miner", "profLvl2": 2, "prof3": "none", "profLvl3": 0,
   "equipment": ["warhammer_1", "iron_head_armor_1", "iron_chest_armor_1", "iron_shield_1",
                 "pickaxe_2", "torch_2", "tinderbox_1", "rope_1"]},
  {"firstName": "Elara", "lastName": "Moonwhisper", "race": "elf", "gender": "f", "birthsign": "hearthfinder_sigil",
   "might": 6, "agility": 13, "endurance": 8, "precision": 11,
   "will": 14, "insight": 15, "lore": 20, "presence": 12,
   "class1": "none", "classLvl1": 0, "class2": "none", "classLvl2": 0,
   "prof1": "alchemist", "profLvl1": 4, "prof2": "hunter", "profLvl2": 2, "prof3": "none", "profLvl3": 0,
   "equipment": ["bow_2", "arrow_1", "dagger_1", "leather_chest_armor_1",
                 "healing_potion_2", "antidote_potion_1", "waterskin_1", "candle_1"]}
]
```

It holds data only, no commands, and is checked so a test party looks like a real one:

- **Party:** a list of 1 to 4 characters, and no more than `$meta_maxCharNum`.
- **Values:** every value above, no others; `name` is made from `firstName` and `lastName`.
- **Names:** follow the character name rules.
- **Fixed lists:** `race`, `gender` (`m`, `f` or `d`) and `birthsign` come from the game's lists; professions are game professions or `"none"`, with levels 1 to 30 when set and 0 for `"none"`; `prof1` is never `"none"`, and no two professions come from the same group (as at character creation). Classes don't exist in the game yet, so `class1` and `class2` stay `"none"` with level 0.
- **Attributes:** whole numbers of at least 1, with the same budgets as character creation: Body (`might`, `agility`, `endurance`, `precision`) adds up to 4-100, Soul (`will`, `insight`, `lore`, `presence`) to 4-100, and both together to 33-104 (33 for the youngest characters, 104 at the peak age). Grimjaw above has 54 + 32 = 86, Elara 38 + 61 = 99.
- **Equipment:** existing item IDs with a tier, such as `"torch_2"`.

The editor's Test refuses to start while the list has problems and says which. On submit, problems are reported and the scene is removed either way. No scene may link to `TestCharacters`, and no other scene or `StoryInit` may set `$char` or `$lead`.

## Accepted forms

### StoryInit

`StoryInit` sets up the story: the required `$meta_` values, your own starting values and the lists you want to use later. Lists may only be created here.

```
<<set $meta_title to "The Salt Road">>
<<set $water to 2>>
<<set $cursed to false>>
<<set $waterStatus to ["dying of thirst", "parched", "thirsty", "fine"]>>
<<set $inventory to ["rope", "torch"]>>
```

### Variables and maths

```
<<set $gold to $gold + 5>>
<<set $gold -= 2>>
<<set $hasSword to true>>
<<set $mood to "angry">>
<<set $a to 1, $b to 2>>
<<set _roll to random(1, 6)>>
<<set $guard to either("asleep", "awake")>>
```

- Story variables start with `$`, temporary ones (only for this scene) with `_`.
- Values: whole or decimal numbers, `true`/`false`, and text in quotes. Quoted text can't contain `< > [ ] { } $ \` or backquotes - except the variable name a choice stores into, such as `"$path"` in `<<radiobutton "$path" "north">>`.
- Maths: `+ - * / %` and brackets; changes with `to`, `+=`, `-=`, `*=`, `/=`.
- Functions: `random(min, max)`, `either(a, b, ...)`, `visited("Scene")`, a list's `.includes(value)` and `.length`. No others.

### Conditions

```
<<if $gold gte 10 and not $cursed>>You are rich.<<elseif $gold gt 0>>You have a little.<<else>>You are broke.<</if>>
<<if $inventory.includes("rope")>>You tie the rope to the rock.<</if>>
<<if visited("Well")>>You have been to the well before.<</if>>
<<switch $guard>><<case "asleep">>The guard snores.<<case "awake">>The guard watches you.<<default>>The post is empty.<</switch>>
```

Comparisons: `is`, `isnot`, `gt`, `gte`, `lt`, `lte` (or `==`, `!=`, `>`, `>=`, `<`, `<=`); combine with `and`, `or`, `not`.

### Showing values

```
You carry <<print $gold>> gold.
You carry $gold gold.
You are <<print $waterStatus[$water]>>.
```

Every shown value appears as plain text, exactly as stored.

### Links and images

```
[[Next]]
[[Go north|North]]
[[Go north->North]]
[[North<-Go north]]
[[Drink|Well][$water to 3]]
[img[oasis.webp]]
[img[gate.webp][Gate]]
<<area 0.1 0.2 0.3 0.4 [[Gate]]>>
```

- Destinations are always written out: a scene name, never a variable.
- The part in the second brackets (`[$water to 3]`) runs when the player clicks.
- Images are file names from the story's image list. `<<area x y width height [[Scene]]>>` makes a clickable area on the image above it (fractions of the image size).

### Buttons

```
<div class="row"><<button "Go to the cave" "Cave">><</button>><<button "Rest" "Camp">><</button>></div>

<<button "Take the sword">><<set $hasSword to true>><<goto "Cave">><</button>>

<<link "Rest" "Camp">><<set $water -= 1>><</link>>
```

- Button and link texts are quoted text, written out.
- Inside a button or link: `<<set>>`, `<<if>>` and `<<goto "Scene">>`. `<<goto>>` is only allowed there, so a scene never jumps on its own.

### Choices

```
<label><<radiobutton "$path" "north">> North</label>
<label><<radiobutton "$path" "south">> South</label>
<label><<checkbox "$careful" false true>> Move carefully</label>
<<listbox "$weapon">><<option "Sword" "sword">><<option "Bow" "bow">><</listbox>>
<<listbox "$item">><<optionsfrom $inventory>><</listbox>>
<<cycle "$stance">><<option "Defensive" "defensive">><<option "Bold" "bold">><</cycle>>
[[Continue|Next]]
```

Players only pick from the options you wrote; they never type anything.

### Legend and endings

```
<<set $meta_mercy += 3>>
<<set $isEnding to true>>
```

- Legend values (see the Legend list) only change with `+=` or `-=` and a whole number.
- Every scene without links ends the story and needs `<<set $isEnding to true>>`; `LastResort` has `<<set $isEnding to false>>`.

### Layout

```
<div class="row">[[Left|L]] [[Center|C]] [[Right|R]]</div>
<<nobr>>
These lines
are shown as one.
<</nobr>>
```

## HTML

Allowed tags: `p`, `br`, `div`, `span`, `b`, `strong`, `i`, `em`, `u`, `s`, `small`, `h1` to `h3`, `ul`, `ol`, `li`, `blockquote`, `hr`, `label`. The only attribute is `class`; style things in the story stylesheet. Not allowed: links (`<a>`), images (`<img>`, use `[img[...]]`), forms and inputs, `<script>`, `<style>`, `<iframe>`, and any `on...` attribute. HTML comments (`<!-- -->`) are fine in scene text, but not inside a command.

## Stylesheet

Any normal CSS is fine. Not allowed: `url(...)`, `@import`, `@font-face`, `expression(...)`, `behavior`, `-moz-binding` and `javascript:`, because they load things from outside the story or run code. The story is shown in its own frame, so its styles can't change the rest of the app.

## Special scenes

- `StoryInit`, `Retreat` and `LastResort` are the only special scenes (see the submission rules for Retreat and LastResort), plus `TestCharacters`, which only exists in the editor and is removed on submit.
- Not allowed: `PassageReady`, `PassageDone`, `PassageHeader`, `PassageFooter`, `StoryInterface`, `StoryCaption`, `StoryMenu`, `StoryBanner` and the scene tags `widget`, `init` and `script`.
- The Story JavaScript must be empty. The platform adds what it needs, such as `<<area>>`, itself.

## Not accepted

| Example | Why | Use instead |
|---|---|---|
| Story JavaScript, `<<script>>`, `<script>` | Runs program code | The forms above |
| `<<run ...>>` | Runs program code | `<<set>>` |
| `<<if Config.debug>>` | Reaches the engine's internals | - |
| `onclick="..."` or another `on...` attribute | Runs program code | `<<button>>`, `<<link>>` |
| `<<textbox>>`, `<<textarea>>`, `<<numberbox>>` | Players never type text | Choices |
| `<<goto $target>>`, `[[Go|$target]]`, `<<include>>` | Destination built from a variable | Written-out scene names |
| `<<goto "Scene">>` outside a button or link | Scene jumps on its own | A link or button |
| `<<timed>>`, `<<repeat>>`, `<<type>>`, audio | Needs a live browser | - |
| `<<linkreplace>>`, `<<append>>`, `<<replace>>` and similar | Changes the page without a new scene | A link to a new scene |
| `<<back>>`, `<<return>>` | The server controls the way back | A link |
| `<<set $list to [...]>>` outside `StoryInit` | Lists are created in one place | Create it in `StoryInit` |
| `"<<"`, `"[["` or `"$gold"` inside quoted text (other than a choice's variable name) | Could read as a command | Plain words |
| `<a href="...">`, `<img src="https://...">`, `url(...)` in CSS | Loads from outside the story | `[[...]]`, `[img[...]]` |

## How the server enforces this

1. **When a story is submitted**, the server reads every scene and checks each command, condition, link and HTML tag against these rules, without running anything. A refusal names the scene, the line and an accepted form.
2. **While a story is played**, every shown value appears as plain text, the characters are put in fresh before every scene, players can only click what the scene shows, and each click has a time limit.
