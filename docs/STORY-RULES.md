# Story Rules

> **Enforced.** The story check runs when you submit, when a reviewer saves edits, and again before a story goes live. It refuses anything that is not described here, and tells you the scene, the line and an accepted form to use instead.

Stories run on the Wudlands server, not in the player's browser. The player only receives the finished scene: text, images and buttons. These rules keep it that way: a story can tell its tale, keep track of things, react to the characters and shape their Legend, but it can't run its own program code, reach outside the story or show players anything the platform didn't check.

Everything in "Accepted forms" below has been tested in SugarCube 2.37.3, the story format the editor uses. It is the only format a story can use: the editor offers no other, and a story naming any other format or version is refused.

## What a story may contain

- Scene text, with a little HTML for layout (see "HTML").
- Images from the story's own image list, and clickable areas on them.
- Links and buttons to other scenes.
- Choices from fixed options: radio buttons, checkboxes, drop-downs and cycling options.
- Story variables: numbers, true/false, short texts, and lists defined in `StoryInit`.
- Conditions, simple maths and dice.
- The characters' names and values, to read.
- Changes to each character's Legend.
- Endings.

Not allowed anywhere: JavaScript, commands that aren't listed here, text input from players, references to the story engine's internals (such as `Config`, `State`, `Engine`, `setup`, `window` or `document`), destinations built from variables, and links, images or styles that load anything from outside the story.

## No nesting inside tags

A command's `<< >>` and an HTML tag's `< >` never contain another command or HTML tag. The one exception is a `[[link]]` inside `<<button>>`, `<<link>>` and `<<area>>`: `[[ ]]` links draw the lines between scenes in the editor, so use them for every way out of a scene. Commands go between an opening and a closing tag instead.

Accepted:

```
<<button [[Take the sword|Cave]]>><<set $hasSword to true>><</button>>
<<area 0.10 0.20 0.30 0.40 [[Gate]]>>
<<for _i, _c range $char>><<if _c.equipment.includes("rope_1")>><<set _hasRope to true>><</if>><</for>>
```

Not accepted:

```
<<print "<<goto 'Cave'>>">>        (a command inside a command)
<span class="<<print $mood>>">     (a command inside an HTML tag)
<<link "<b>Go</b>" "Cave">>        (an HTML tag inside a command)
```

## Characters

The server puts the playing characters into every scene. A story reads all their values but changes only one kind: their Legend (see "Legend"). Injuries and other changes to attributes come only from tags the platform defines (see "Checks and fights").

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
| **Numbers** | `might`, `agility`, `endurance`, `precision`, `will`, `insight`, `lore`, `presence`, `classLvl1`, `classLvl2`, `profLvl1`, `profLvl2`, `profLvl3` (attributes as they are now, injuries included) |
| **Equipment** | `equipment`: the items the character carries, as item IDs with a tier, such as `"rope_1"` or `"pickaxe_2"` |
| **Legend** | `fame`, `infamy`, `renown`, `obscurity`, `faith`, `heresy`, `honor`, `shame`, `loyalty`, `treachery`, `mercy`, `cruelty`, `courage`, `cowardice`, `favour`, `disgrace`, `purity`, `corruption`, `wildkin`, `despoiler`, each 0 to 100 |

**How each kind may be used:**

1. **Names only appear in scene text.** Print them on their own, never inside another command, condition, link, button or piece of text being put together.
2. **Fixed-list values** may be printed and compared with a quoted value.
3. **Numbers** may be printed, compared and used in maths.
4. **Equipment** may be checked with `.includes("item_tier")`. The tier is the lowest one that counts: `"candle_1"` means a candle of tier 1 or better, `"pickaxe_2"` a pickaxe of tier 2 or better. The item ID must exist.
5. **Legend values** may also be changed, only with `+=` or `-=` and a whole number (see "Legend").
6. **Nothing else** may be set, changed or removed, and `StoryInit` never contains character data.

Accepted:

```
<<print $lead.firstName>> draws her sword.
$lead.firstName draws her sword.
<<print $char[1].name>> keeps watch.
<<if $lead.might gte 6>>You force the door open.<</if>>
<<if $lead["might"] + $lead["endurance"] gte 12>>The boulder rolls aside.<</if>>
<<if $lead.class1 is "warrior">>The guard salutes you.<</if>>
<<if $lead.fame gte 30>>The innkeeper knows your name.<</if>>
<<set $lead.mercy += 3>>
```

Not accepted:

```
<<set $greeting to "Hello " + $lead.firstName>>   (a name inside a command)
<<if $lead.firstName is "Grimjaw">>               (a name in a condition)
[[Ask $lead.firstName|Tavern]]                     (a name in a link)
<<set $lead.might -= 2>>                           (injuries come from the platform's tags)
<<set $lead.mercy to 50>>                          (Legend only changes with += or -=)
<<set $char to [...]>>                             (the server sets the party)
```

**The whole party** - loop over `$char` with `<<for ... range>>`:

```
<<set _total to 0>>
<<for _i, _c range $char>><<set _total to _total + _c.might>><</for>>
<<if _total gte 15>>Together you push the boulder aside.<</if>>

<<for _i, _c range $char>>
  <<if _c.agility gte 5>>_c.firstName leaps across.<<else>>_c.firstName stumbles but makes it.<</if>>
<</for>>

<<for _i, _c range $char>><<set _c.courage += 1>><</for>>
```

`range $char` is the only loop: it always ends.

**Equipment:**

```
<<if $lead.equipment.includes("rope_1")>>You climb down on your rope.<</if>>
<<if $lead.equipment.includes("pickaxe_2")>>Your pickaxe bites into the hard rock.<</if>>
```

### Checks and fights (planned)

A story never injures a character or changes its attributes itself. That will come from tags the platform defines:

- **Checks:** you mark where a check happens, such as a difficult jump. The server rolls it with the characters' values and decides what a failure costs, such as an injury. The tags' form comes later.
- **Fights:** fight scenes come from the platform, not from your story, and have a fixed layout. When a fight ends, the player returns to the scene of your story where it began. A fight can injure characters.

Comparing character values with `<<if>>` only steers your story. It never costs a character anything.

### Test characters

To try a story with characters, add a scene called `TestCharacters` with up to 4 characters as a plain list (JSON), leader first. The editor's Test puts them into `$char` and `$lead`. When you submit, the party is checked and stored with your submission as its test party, apart from the scenes, for test runs on the server; it never becomes a scene of the story. In a real adventure, the server brings in the players' characters instead.

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
- **Values:** every value above, no others; `name` is made from `firstName` and `lastName`. Legend values may be left out, and then count as 0.
- **Legend:** whole numbers from 0 to 100. In a pair only one side is above 0, except fame and infamy.
- **Names:** follow the character name rules.
- **Fixed lists:** `race`, `gender` (`m`, `f` or `d`) and `birthsign` come from the game's lists; professions are game professions or `"none"`, with levels 1 to 30 when set and 0 for `"none"`; `prof1` is never `"none"`, and no two professions come from the same group (as at character creation). Classes don't exist in the game yet, so `class1` and `class2` stay `"none"` with level 0.
- **Attributes:** whole numbers of at least 1, with the same budgets as character creation: Body (`might`, `agility`, `endurance`, `precision`) adds up to 4-100, Soul (`will`, `insight`, `lore`, `presence`) to 4-100, and both together to 33-104 (33 for the youngest characters, 104 at the peak age). Grimjaw above has 54 + 32 = 86, Elara 38 + 61 = 99.
- **Equipment:** existing item IDs with a tier, such as `"torch_2"`.

The editor's Test refuses to start while the list has problems and says which. A party with problems refuses the submit, so the stored party is always one a test run can play with. A story without a `TestCharacters` scene has no test party. A reviewer who opens your submission gets the party back as a `TestCharacters` scene, and saving their edits stores it again. No scene may link to `TestCharacters`, and no other scene or `StoryInit` may replace `$char` or `$lead`.

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
- Values: whole or decimal numbers, `true`/`false`, and text in quotes. Quoted text can't contain `< > [ ] { } $ \`, backquotes or `@@` - except the variable name a choice stores into, such as `"$path"` in `<<radiobutton "$path" "north">>`.
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
[[Walk north->North]]
[[North<-Head north]]
[[Drink|Well][$water to 3]]
<<if $hasKey>>[[Unlock the door|Hall]]<<else>>[[Try the door|Locked]]<</if>>
[img[oasis.webp]]
[img[gate.webp][Gate]]
<<area 0.10 0.20 0.30 0.40 [[Gate]]>>
<<area 0.55 0.20 0.45 0.80 [[Climb the wall->WallTop]]>>
```

- Destinations are always written out: a scene name, never a variable.
- Every link and button in a scene has its own text (`[[Cave]]` counts as the text "Cave"; upper and lower case and extra spaces don't make a difference). The player's choice comes back to the server as its text, never as where it leads, so two choices with the same text would be ambiguous. That holds across the branches of an `<<if>>` or `<<switch>>` too, although only one branch is shown: a text always stands for one link, so the server knows where a click leads without running the scene. Write `[[Unlock the door|Hall]]` and `[[Try the door|Locked]]`, not "Open the door" twice. Links and buttons don't go inside `<<for>>`, which would show them once per character. Hotspots and image links have no text of their own and aren't counted. Radio buttons, checkboxes and options count too (see Choices): no two choices in a scene share a text.

Not accepted:

```
[[Go on|Cave]] [[Go on|Camp]]
[[Cave]] <<button "Cave" "Camp">><</button>>
<<if $a>>[[Rest|Camp]]<</if>> <<if $b>>[[Rest|Inn]]<</if>>
<<if $hasKey>>[[Open the door|Hall]]<<else>>[[Open the door|Locked]]<</if>>
<<for _i, _c range $char>><<button [[Help|Camp]]>><</button>><</for>>
```
- Link and button texts are plain words: letters, digits, spaces and `. , ! ? ' : ; -` (typographic quotes, dashes and `…` too, but no straight `"`). SugarCube runs a link's text as program code before showing it, so brackets, `=`, `+`, `$`, `_` and the like are refused there.
- The part in the second brackets (`[$water to 3]`) runs when the player clicks.
- Images are uploaded files from the story's Images list, written as the plain file name: a name of letters, digits, `_` and `-`, then `.webp`, `.png` or `.jpg`, like `[img[gate_open.webp]]`. No folders, web addresses, `data:` images, variables or tooltips (`[img[text|file]]`), and every image must be uploaded before you submit. An image may sit inside `<<if>>` to show it only sometimes; put its `<<area>>` lines in the same branch.
- Nothing else may show a picture: no `<img>`, `<svg>`, `<picture>` or media tags, no `src=`, and no `url(...)` or `@import` in styles. Scenes tagged `Twine.image` aren't accepted.
- `<<area>>` makes a clickable area on the scene's image (the first one, if there are several). The editor's hotspot tool writes these lines at the end of the scene: x, y, width and height as fractions of the image size with two decimals, then the link. A label that differs from the scene name is written as `[[Label->Scene]]`.

### Buttons

```
<<button [[Go to the cave|Cave]]>><</button>>
<<button [[Take the sword|Cave]]>><<set $hasSword to true>><</button>>
<<link [[Rest|Camp]]>><<set $water -= 1>><</link>>
<div class="row"><<button [[Enter the cave|Cave]]>><</button>><<button [[Sit down|Camp]]>><</button>></div>
```

- Write where a button or link leads as a `[[link]]` inside it, so the editor draws the line to that scene.
- Button and link texts are written out, never built from variables.
- Between the opening and the closing tag: `<<set>>` and `<<if>>`. They run when the player clicks, before the story moves on.
- Also accepted: the destination as quoted text, `<<button "Go to the cave" "Cave">>`, and `<<goto "Scene">>` between a button's or link's tags. Neither draws a line in the editor. `<<goto>>` is only allowed there, so a scene never jumps on its own. The scene must exist, and it is never `LastResort`.

### Random jumps

```
<<button "Run for it">><<goto `either("P1", "P7", "P8")`>><</button>>
<<button "Turn the page">><<goto `"P" + random(1, 30)`>><</button>>
<<button "Dive in">><<set $roll to random(1, 100)>><<if $roll lte 20>><<goto "Pearl">><<else>><<goto "Shore">><</if>><</button>>
```

- `` `either("P1", "P7", "P8")` `` goes to one of the listed scenes, each equally likely.
- `` `"P" + random(1, 30)` `` goes to one of the scenes `P1` to `P30`, each equally likely; every one of them must exist. A range reaches at most 200 scenes, and the text in quotes may also be empty, for scenes named `1` to `30`.
- The backquotes are needed: without them SugarCube reads the pick as a scene name and never jumps. These two shapes are the only backquotes accepted, with written-out scene names and whole numbers only.
- For uneven odds, roll a number and pick the scene with `<<if>>`, as in the third line.
- Like every `<<goto>>`, a random jump sits between a button's or link's tags.

Not accepted:

```
<<button "Run for it">><<goto either("P1", "P7", "P8")>><</button>>
<<button "Turn the page">><<goto "P" + random(1, 30)>><</button>>
<<button "Go">><<goto `"P" + $page`>><</button>>
<<button "Go">><<goto `"P" + random(1, 500)`>><</button>>
<<button "Go">><<goto `either("P1", "P1")`>><</button>>
```

### Choices

```
<label><<radiobutton "$path" "north">> North</label>
<label><<radiobutton "$path" "south">> South</label>
<label><<checkbox "$careful" false true>> Move carefully</label>
<<listbox "$weapon">><<option "Sword" "sword">><<option "Bow" "bow">><</listbox>>
<<cycle "$stance">><<option "Defensive" "defensive">><<option "Bold" "bold">><</cycle>>
[[Continue|Next]]
```

Players only pick from the options you wrote; they never type anything. Each radio button and checkbox sits inside its own `<label>`, with plain words as its text (like a link's text) and nothing else in it. Every text a player can pick appears once in a scene: link and button texts, radio button and checkbox labels, and the options of drop-downs and cycles, also across different lists and in different branches of an `<<if>>`, because the player's pick comes back as its text. A choice stores into your own story variable (never `$char`, `$lead`, `$isEnding` or a `$meta_` value). Also accepted: `checked` or `autocheck` after a radio button or checkbox, `autoselect` after the variable of a listbox or cycle, and `selected` after an option.

Options are always written out with `<<option>>`. `<<optionsfrom>>` isn't accepted: its texts would come from a variable while the story is played, so the check couldn't read them. For options that change during the story, put radio buttons inside `<<if>>`, like `<<if $hasRope>><label><<radiobutton "$tool" "rope">> Rope</label><</if>>`.

Not accepted:

```
<<radiobutton "$path" "north">> North
<label><<radiobutton "$path" "north">></label>
<label><<radiobutton "$path" "north">> $direction</label>
<label><<radiobutton "$path" "north">><<radiobutton "$path" "south">> North or south</label>
<label><<radiobutton "$a" true>> Yes</label> <label><<radiobutton "$b" true>> Yes</label>
<<listbox "$weapon">><<option "Sword" "a">><</listbox>> <<cycle "$stance">><<option "Sword" "b">><</cycle>>
<label><<checkbox "$rest" false true>> Rest</label> [[Rest|Camp]]
<<listbox "$item">><<optionsfrom $inventory>><</listbox>>
```

### Legend

Every character has 20 Legend values from 0 to 100, in 10 pairs: `fame`/`infamy`, `renown`/`obscurity`, `faith`/`heresy`, `honor`/`shame`, `loyalty`/`treachery`, `mercy`/`cruelty`, `courage`/`cowardice`, `favour`/`disgrace`, `purity`/`corruption`, `wildkin`/`despoiler`.

```
<<if $lead.fame gte 30>>The guards wave you through.<</if>>
<<set $lead.mercy += 3>>
<<set $char[1].cruelty += 2>>
<<for _i, _c range $char>><<set _c.cowardice += 2>><</for>>
```

- Change a Legend value only with `+=` or `-=` and a whole number: on `$lead`, on `$char[1]` and so on, or on `_c` in a `range $char` loop. Never with `to`.
- The server applies every change with the Legend rules: a pair is one scale, so raising one side first wears the other down; fame and infamy pull against each other; and some changes echo into other values. A real run can therefore end with other numbers than the editor's Test, which just adds.
- **Focus:** a story changes at most 2 pairs. The submit check refuses a third. Only the changes your story writes count: echoes that the Legend rules add (such as cruelty raising infamy) don't, and reading any value is always fine.
- **Most a story can change:** for each pair, add up the sizes of all the changes your story writes for it, counting each written change once. That total, but never more than 10, is the most your story can ever move that pair for one character. The first time a character plays your story, the server sets these points aside, without showing them. Every change uses up its size, and a change bigger than what's left moves only what's left. Once a pair's points are spent, nothing in your story changes it for that character again, also not on a replay.
- A change counts as soon as its scene plays, and stays even if the run ends in `Retreat` or `LastResort`.
- `Retreat` costs no Legend by default. You may set a small price there, such as 1 cowardice; it counts like any other change.

### Endings

```
<<set $isEnding to true>>
```

- Every scene without links ends the story and needs `<<set $isEnding to true>>`; `LastResort` has `<<set $isEnding to false>>`.
- Only a run that reaches an ending of the main story counts as completed and unlocks follow-up stories. An ending reached through `Retreat` uses up the play but never counts as completed; `LastResort` gives the play back.

### Layout

```
<div class="row">[[Left|L]] [[Center|C]] [[Right|R]]</div>
<<nobr>>
These lines
are shown as one.
<</nobr>>
<!-- A note for yourself: players never see it. -->
<<button [[Rest|Camp]]>><!-- also between a button's tags --><<set $water -= 1>><</button>>
```

Comments (`<!-- ... -->`) go anywhere in a scene, on one line or several, but never inside a command's `<< >>`.

## HTML

Allowed tags: `p`, `br`, `div`, `span`, `b`, `strong`, `i`, `em`, `u`, `s`, `small`, `h1` to `h3`, `ul`, `ol`, `li`, `blockquote`, `hr`, `label`. The only attribute is `class`; style things in the story stylesheet. Not allowed: links (`<a>`), images (`<img>`, use `[img[...]]`), forms and inputs, `<script>`, `<style>`, `<iframe>`, and any `on...` attribute. HTML comments (`<!-- -->`) are fine in scene text, but not inside a command.

## Stylesheet

Any normal CSS is fine. Not allowed: `url(...)`, `image-set(...)`, `image(...)`, `cross-fade(...)`, `element(...)`, `@import`, `@font-face`, `@namespace`, `expression(...)`, `behavior`, `-moz-binding` and `javascript:`, because they load things from outside the story or run code; also backslash escapes (they can hide the words above) and `<`. The story is shown in its own frame, so its styles can't change the rest of the app.

## Story name and tags

- The story's name (Story > Details) is plain words, like a link text: letters, digits, spaces and `. , ! ? ' : ; -`, at most 100 characters. SugarCube shows the name in its sidebar as markup, so `<`, `[`, `$` and the like could run there; a backslash or a line break stops the story from starting.
- Tags are single words without spaces (the editor turns a space into `-`). SugarCube splits a scene's tags at spaces, so one tag `x widget` would make it a widget scene.
- The story's own settings have the kinds the editor gives them: text for the stylesheet and the Story JavaScript, a list of tags, colour names for tag colours.

## Special scenes

- `StoryInit`, `Retreat` and `LastResort` are the only special scenes (see the submission rules for Retreat and LastResort), plus `TestCharacters`, the test party, which is stored apart from the scenes on submit (see "Test characters").
- `StoryInit` only sets up values: `<<set>>`, `<<if>>` and `<<switch>>`, and the cover image.
- Not allowed: `PassageReady`, `PassageDone`, `PassageHeader`, `PassageFooter`, `StoryInterface`, `StoryCaption`, `StoryMenu`, `StoryBanner`, `StorySubtitle`, `StoryAuthor`, `StoryShare`, `StoryDisplayTitle`, the scene tags `widget`, `init`, `script` and `stylesheet` (SugarCube plays a `script` or `stylesheet` scene as an ordinary scene in a Twine 2 story; styles go in the Story Stylesheet), and media scenes (`Twine.image`, `Twine.audio`, `Twine.video`, `Twine.vtt`).
- The Story JavaScript must be empty. The platform adds what it needs, such as `<<area>>`, itself.

## Not accepted

| Example | Why | Use instead |
|---|---|---|
| Story JavaScript, `<<script>>`, `<script>` | Runs program code | The forms above |
| `<<run ...>>` | Runs program code | `<<set>>` |
| `<<if Config.debug>>` | Reaches the engine's internals | - |
| `onclick="..."` or another `on...` attribute | Runs program code | `<<button>>`, `<<link>>` |
| `<<textbox>>`, `<<textarea>>`, `<<numberbox>>` | Players never type text | Choices |
| `<<goto $target>>`, `[[Go|$target]]`, `<<include>>` | Destination built from a variable | Written-out scene names, or a random jump (see Random jumps) |
| `<<goto "Scene">>` outside a button or link | Scene jumps on its own | A link or button |
| `<<timed>>`, `<<repeat>>`, `<<type>>`, audio | Needs a live browser | - |
| `<<linkreplace>>`, `<<append>>`, `<<replace>>` and similar | Changes the page without a new scene | A link to a new scene |
| `<<back>>`, `<<return>>` | The server controls the way back | A link |
| `<<set $list to [...]>>` outside `StoryInit` | Lists are created in one place | Create it in `StoryInit` |
| `<<set $meta_mercy += 3>>` | Legend belongs to each character | `<<set $lead.mercy += 3>>` |
| `<<set $gold = 5>>` | Changes are written with `to` | `<<set $gold to 5>>` |
| `<<set $a to 1; $b to 2>>`, `[[Go\|Cave][$a to 1; $b to 2]]` | Changes are separated with a comma | `<<set $a to 1, $b to 2>>` |
| `<<set $lead.might -= 2>>` | Attributes only change through the platform's checks and fights | - |
| `"<<"`, `"[["` or `"$gold"` inside quoted text (other than a choice's variable name) | Could read as a command | Plain words |
| `[[alert(1)\|Cave]]`, `[[$name\|Cave]]` | SugarCube runs a link's text as code | Plain words, like `[[Go north\|North]]` |
| `@@color:red;text@@`, `/* comment */` | Not part of the rules | A class and the stylesheet; `<!-- comment -->` |
| `<<set $gold to 5 <!-- note -->>>` | A comment inside a command | `<<set $gold to 5>> <!-- note -->` |
| `<<print "<<goto 'Cave'>>">>`, `<span class="<<print $mood>>">` | A command inside a tag | Commands between an opening and a closing tag |
| `<a href="...">`, `<img src="https://...">`, `url(...)` in CSS | Loads from outside the story | `[[...]]`, `[img[...]]` |

## How the server enforces this

1. **When a story is submitted**, the server reads every scene and checks each command, condition, link and HTML tag against these rules, without running anything (`backend/story_rules.py`). A refusal names the scene, the line and an accepted form. The server also counts the Legend pairs the story changes and adds up its points per pair (stored as `legendPoints`), and checks and stores the test party (`backend/test_characters.py`). A reviewer's saved edits pass the same check, and Approve runs it once more, so a story submitted before a rule existed can't go live without it.
2. **While a story is played**, every shown value appears as plain text, the characters are put in fresh before every scene, Legend changes go through the Legend rules and the story's points, players can only click what the scene shows, and each click has a time limit.
