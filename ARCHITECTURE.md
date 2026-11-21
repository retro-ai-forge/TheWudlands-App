# Architecture: services, the control layer and the story stack

Updated 2026-11-21. How TheWudlands is split into Cloud Run services, what each one may do, how a story gets from the editor to players, and how `serverless-wudlands` controls every adventure: the story stack (main story, side stories, fights), checks, Legend, endings.

How Twine and SugarCube behave inside (what SugarCube runs as code, the story check, the editor's sealed frame, the jsdom engine) is in `twinejs-integrated/APP_INTEGRATION_HEADLESS.md`. What a story may contain is in `docs/STORY-RULES.md` ("the story rules").

## Goals

- Players can't see a story's logic, its other scenes or its variables.
- Players can't cheat through the browser: they only send which choice they clicked, and see nothing behind it.
- Dice, checks, fights, Legend and rewards are decided on the server.
- The browser is a thin renderer: it shows the scene and sends back a pick.
- Authors test with the same engine players play with.

## The three services

| Service | Runs | Status |
|---|---|---|
| `serverless-wudlands` | The whole game: website, Twine editor files, wallet login and the FastAPI backend. The control layer. | Exists |
| `engine-live` | SugarCube for one click at a time, for **live** stories (`twine_live`) played by players | Planned |
| `engine-test` | SugarCube for one click at a time, for **submitted** stories (`twine_review`) played by their author and by reviewers | Planned |

Both engines are the same image. Only their settings differ (`WORKER_MODE` and the instance limits, see "Settings").

## Rights

| | `serverless-wudlands` | `engine-live` | `engine-test` |
|---|---|---|---|
| Service account | `cloud-run-firestore-sa` | `engine-sa` (no permissions) | `engine-sa` (no permissions) |
| Database (Firestore) | Read and write | **No** | **No** |
| Image bucket | Read and write | **No** | **No** |
| Secrets in the environment | Yes | **None** | **None** |
| Outbound internet | Yes | **No** | **No** |
| Who may call it | Everyone (website and API) | Only `serverless-wudlands` (`roles/run.invoker`) | Only `serverless-wudlands` (`roles/run.invoker`) |
| Runs story code | **Never** | Reviewed stories | Unreviewed stories |
| Remembers anything between clicks | Everything (it holds the database) | Nothing but cached story pages | Nothing but cached story pages |

The engines need no database: `serverless-wudlands` loads the story and the saved state, sends them with the click, and saves what comes back. In the 2026-11-19 tests one `<<set>>` line escaped jsdom and ran its own commands (details in the engine document). An engine with credentials would hand them to such a story. Story code must never run inside `serverless-wudlands`: every process there can fetch the service account's token from the metadata server.

## Who plays what, where

| Who | Plays | Where the story's code runs | Effects on characters |
|---|---|---|---|
| Player | Live stories | `engine-live` | Yes: Legend, injuries, loot, completed stories, plays used |
| Author | Their own submitted story (test run) | `engine-test` | **None** |
| Reviewer | Submitted stories (test run) | `engine-test` | **None** |
| Author or reviewer in the editor (Test, Run here, Play, Proof) | The story open in their editor | A sealed frame in their own browser | None (no server involved) |

The browser never chooses an engine and never talks to one. It talks only to `serverless-wudlands`.

## From the editor to a running adventure

1. **Writing:** the editor (static files at `/twine/` in `serverless-wudlands`) keeps stories in the browser and syncs them to `twine_stories`. Images go to the bucket's `create` stage. Editing needs no login; cloud save, image upload, submit and review copies do.
2. **Submitting:** `POST /api/auth/me/twine-stories/{id}/submit` runs the story check (`_check_twine_syntax`, `backend/story_rules.py`): the story rules for every scene, the story's name, tags and fields, the links and endings, `Retreat` and `LastResort`. It stores the `TestCharacters` party apart from the scenes as `testCharacters`, freezes a copy in `twine_review` and copies the images to the `review` stage. For 7 days after the last submit the author may submit again (each submit restarts the 7 days); then the story is locked and waits for review, with no time limit. The 7-day lock only stops submitting: the working copy in `twine_stories` can always be edited.
3. **Reviewing:** only after the 7 days (409 before). A reviewer opens the submission from the review page as a review copy in their editor. The server sends today's story check with it (`checkProblems`); while it finds problems the editor won't run the copy. The reviewer may fix it and **Save review** (`PUT /twine-reviews/{owner}/{storyId}`, `save_twine_review`): reviewers only, after the 7 days, the full story check, images only from the frozen review stage, the submission stays the author's (id, name, IFID, owner wallet; `lastUpdate` untouched), each save recorded in `reviewEdits`. Planned: the reviewer also sets each scene's environment, from an LLM's suggestion (see "When a side story starts"). Then **Approve** or **Reject** (with a public reason).
4. **Live:** Approve runs today's story check again (409 with the first problem), copies the images to the `served` stage, stores the live copy in `twine_live` (`_id` = story id, so one live story per id) and keeps the review entry as an `approved` record without the text. A live story is locked for its author for good: changes go out as a new story with a new id (the editor's Duplicate); only the platform fixes a live story. Authors can't load from `twine_review`, so reviewer edits are missing from their working copy (planned: **Load live version**).
5. **Starting a run:** the run loads the story from `twine_live` and pins that version in `story_snapshots` (`author:storyId:hash`), so a platform fix never changes a running adventure.

## Images

- **Stages** (`backend/twine_images.py`): `twine-images/{wallet}/create/{storyId}/` is the author's working copy, `twine-images/{wallet}/review/{storyId}/` the copy frozen on submit, and `twine-images/served/{storyId}/` the live copy (no wallet; Approve copies it there).
- **Access:** files are public by exact URL, the bucket can't be listed. Uploads go only through the backend (jpeg, png or webp; the editor converts to WebP).
- **In stories:** images are referenced by file name (`[img[oasis.webp]]`). The story check refuses names that weren't uploaded; the engine's output points them at the bucket.
- **Later, if needed:** signed URLs (against sharing spoiler links) or a CDN or R2 in front of `served` (egress costs). Either is a backend-only change.

## `serverless-wudlands` is the control layer

The engines only calculate. `serverless-wudlands` decides everything else, and only it can push a side story or a fight onto an adventure.

### Every click

1. **Check the click:** load the session; is it this player's turn, does the step counter (`seq`) match, is the choice offered? A stale or repeated request gets the current state (409).
2. **Pick the engine** from where the top frame's story came from, never from anything the browser sends: a story from `twine_live` runs on `engine-live`, one from `twine_review` on `engine-test`.
   ```python
   def engine_url(frame) -> str:
       return ENGINE_TEST_URL if frame["mode"] == "test" else ENGINE_LIVE_URL
   ```
3. **Decide whether to push** (see "The story stack"): the clicked element may ask for a fight, and the control layer may start a side story here.
4. **Send** the snapshot ID (the full story only when the engine doesn't have it cached), the frame's saved SugarCube state, fresh `$char`/`$lead` and the choice with its picks (see "What the player receives").
5. **Read the answer:** the new scene and state, plus what the story asked for: Legend changes, an ending, a skill check, a consequence (a predefined tag, such as an injury), a fight.
6. **Decide:**
   - **Story continues:** save the state (conditional update on `seq`), send the scene to the browser.
   - **Skill check:** roll in Python (see "Skill checks"), then let the engine enter the success or the failure scene.
   - **Consequence:** a scene can ask for one with a predefined tag, such as an injury; Python applies it (an injury through `condition.apply_loss`). If the lead can't act any more, the player picks a new lead first; if no member can, the adventure ends (see "When characters die").
   - **Fight or side story:** push it (see below).
   - **Ending:** pop the frame, or end the run if it was the bottom one.
7. **Distrust the engine:** the next scene must be one the story's links allow, Legend changes must stay within the rules and the story's points, the HTML is cleaned and sizes are limited.

The server steps in only where the story asks it to, with commands the author writes (such as a future `<<fight "goblins">>`) and result variables the author knows, or between scenes for side stories, which no story code can start or stop.

### Skill checks (decided 2026-11-21)

Skill checks such as jumping or climbing are rolled by the control layer, not by story code:

- **The story names the button's label, the check, the difficulty and the two scenes,** for example (syntax still to design) `<<check "Climb the cliff" "climb" "hard" [[Cliff top]] [[Cliff bottom]]>>`. The player sees only the label, "Climb the cliff"; the skill, the difficulty and both scenes stay on the server.
- **Python rolls at the click,** with the characters' current values (`attrNow`, injuries included), their professions and their gear (a rope for climbing, like the gathering gear bonuses in foraging). Skills, difficulties and odds live in one data file, like the foraging rules, so every story uses the same rules.
- **The engine then enters the success or the failure scene.** The player never sees a number, only where they end up. The roll is drawn fresh and nothing about it is kept.
- **What a failure costs** (an injury through `condition.apply_loss`) is applied by Python, because story code never changes a character.
- **In the editor** a placeholder offers **Pass** / **Fail** buttons, so authors can test both branches.
- **A story's own random numbers** (`random`, `either` in a button) stay for pure chance, such as which way the current carries the boat or whether the guard is asleep.

### Picking a party member (decided 2026-11-21)

When a story lets the player choose which character acts, the control layer makes that choice, not story code:

- **The story names the scene to go to,** for example `<<pick_member [[CliffTop]]>>` (as in the tutorial, which marks it as coming soon; may still change). The server shows one button per party member who can act (see "When characters die"), labelled with the character's name; clicking one picks that member and enters the scene.
- **The server knows who was picked by character id.** Each of these buttons gets a neutral handle, like a hotspot, so two members with the same name are no problem, and the names never pass through SugarCube's link text, which it runs as code.
- **The control layer keeps the pick** (the character id) in the story's frame. Every click the engine fills `$picked` with that character's current data, like `$lead`, so it never holds old values or old Legend.
- **`$picked` stays until the next `<<pick_member>>`,** through any number of scenes, and a skill check right after a pick is taken by that character. Before the first pick it is the lead, so it is never empty and the check needn't prove that a pick comes first on every path. When the picked member can't act any more, the pick is cleared, so `$picked` is the lead again.
- **Story code can't set it,** like `$char` and `$lead`: it reads `$picked` and changes its Legend with `+=`/`-=`, and only `<<pick_member>>` changes who it is.
- **Each story frame has its own pick.** A side story starts with `$picked` as the lead; when it is popped, the story below has its own pick back.
- **Authors don't build per-character choices themselves:** links and buttons inside `<<for>>` stay refused. A click would only say "Help", not whose row it came from, and the button would act on the last character of the loop.
- **In the editor** a placeholder shows one button per member of the test party.

### When characters die (decided 2026-11-21)

Only Python changes characters (an injury from a failed skill check, a consequence tag, a fight), so the control layer sees the moment a character dies, and steps in where needed. Death itself is the character's `dead` status, written when it happens, like anywhere else in the game.

- **The undead still act.** A dead character can be turned into a vampire or another kind of undead, in a story that allows it. These are life states of their own, never `dead`, the first entry of `vitalStatus` like `alive` and `dead`: `["vampire"]`, `["undead"]` (the kinds listed in a data file; `soulless` stays a condition after the life state). They last after the adventure, and everywhere else in the game they count as alive: foraging, crafting and starting adventures treat `alive`, `vampire` and `undead` alike (`is_alive` will read that list instead of only `alive`). Turning gives Body back: each Body attribute gets a share of its maximum, rounded up, 25% for an undead and 50% for a vampire (numbers in a data file; stored as a smaller `attrLost`); Soul stays as it is. Their values are then above 0, because only the dead have Body at 0, so skill checks, foraging and crafting use them like a living character's, and a vampire or undead whose Body reaches 0 is dead again (`condition` already turns a drained Body into `dead`). No special rules for the undead yet: healing, Soul and everything else work as for the living, so a turned character heals back towards its maximum over time (maybe special rules later). A member **can act** when it is alive or undead: it can lead, gets a `<<pick_member>>` button and keeps the adventure going. A member whose life state is `dead` has **fallen**.
- **Fallen members stay in the party until the adventure ends.** They keep their place in `$char`, so `$char[1]` still means the same character, and a story can tell who is dead or undead from `vitalStatus`, which `$char` already carries (planned: the story check lets stories read it, such as `<<if $char[1].vitalStatus.includes("vampire")>>`). They get no `<<pick_member>>` button and never lead.
- **When the lead falls, the player picks a new lead** before the next scene, from the members who can act, on the same one-button-per-member screen as `<<pick_member>>`, made by the platform, not the story. On the stack it is a small platform frame: pushed when the lead falls, popped with the new lead, then the remembered step goes on, so the next scene already gets the new `$lead`.
- **The session moves the `lead` flag** in `members` and `serverVars.lead`; `$char` keeps the marching order.
- **With one member left who can act,** it becomes the lead without asking. A lead who dies and is turned in the same step stays the lead.
- **Story code never sets `$lead`** (`<<set $lead to …>>` stays refused): a death can happen in any scene, so the story can't plan for it, and only the platform's pick keeps the lead a member who can act.
- **When every member has fallen, the adventure ends at once,** wherever it is (a party of vampires plays on): every frame is popped (side stories, fights) without being resumed, and the run ends as an ending (`$isEnding`). The run stays spent, everything in camp storage is lost, and the characters already carry the dead status. It is logged as `fallen`, not `finished`, so it doesn't add to `completedStories` or unlock follow-up stories.
- **The story decides who may enter.** Settings in `StoryInit` like the other `$meta_` values (names still to design): either what may enter (such as only `vampire`) or what may not (such as no `undead`), and what must be there (such as one `alive` and one `dead`, for a story about carrying a fallen friend home). The values are the life states and `soulless`. Without settings, every member who can act may enter and the fallen may not, as today (`start_adventure` refuses the dead). The lead is always a member who can act. The submit check accepts only known values and never both lists; the start checks the party against them.

### The story stack

An adventure is a stack of frames. The top frame is the active one; everything below waits, unchanged.

```
 ┌─────────────────────────┐
 │ fight: goblins          │  ← active: Python runs it, no engine
 ├─────────────────────────┤
 │ side story: the familiar│  parked at the click that started the fight
 ├─────────────────────────┤
 │ main story              │  parked at the click that started the side story
 └─────────────────────────┘
```

- **Frames:** a **story** frame (the bottom one: the story the player started), a **side story** frame (another live story, picked by the control layer, for example for the party's familiar or companion), or a **fight** frame (run by Python with the platform's fight screen; no engine, no story code). A story or side story frame holds its own pinned snapshot, its own SugarCube state and its engine mode.
- **Push, only at a click, before the click is applied:** the frame below is parked as it is (the scene the player is on), together with the click that was made. Nothing of the click has run yet.
- **Pop, with a result:** the top frame ends (a side story's ending, a fight's outcome) and is removed. Its result is written into the parked frame's state as result variables the author knows (such as `$fightWon`, or the side story's outcome), and then the remembered click is applied. The resumed story continues exactly like a normal step: restore its state, apply the click, show the next scene, which can read the result.
- **Why this rule:** a restored scene runs its commands again. Because a push never happens inside a scene's rendering, a resumed scene can't ask for the same fight or side story twice, and the existing "restore, click, count changes once" step works unchanged for every frame.
- **One session, one counter:** the whole stack lives in one `adventure_sessions` document with one `seq`, so a push or pop is a single conditional update and a racing request can't apply it twice. Planned shape: `stack: [{kind, mode, storyAuthor, storyId, snapshotId, state, parkedClick}]`, top last.
- **Never two stories in one page:** the engine always runs one frame's story. Side stories are never injected into the main story's page or its variables.
- **Recovery:** `recover_adventures` must understand stacks: a crash mid-push or mid-pop leaves the previous stack, and the retry runs the click again.

#### When a side story starts (decided 2026-11-21)

- **Every scene has an environment,** such as at sea or in a forest. Prepared side stories list the environments they fit.
- **Reviewers set the environments, not authors.** Authors only give the story its genre tags. During review, an LLM suggests an environment for each scene and the reviewer confirms or corrects it.
- **A small chance in every scene:** at each click in a scene of the main story, the control layer rolls once. Each side story that fits the scene's environment has its own small chance, such as 0.5%; a hit pushes that side story before the click is applied.
- **The platform sets each side story's chance,** stored with the live side story at approval. Authors never set it.
- **Example:** a ship voyage is the main story and its scenes are set at sea. The dolphin companion side story fits the sea at 0.5% per scene.
- **How often that is:** the chance adds up over the scenes. At 0.5% per scene, a 30-scene voyage meets the dolphin in about 14% of runs (1 − 0.995^30), a 60-scene one in about 26%.

Recommendations for the details:

- **A fixed list of environments** in a data file, like the other rules. A scene without one never starts a side story, so a reviewer can keep a tense scene free of them.
- **Stored apart from the story text:** a separate field next to the story, like `testCharacters`, not a scene and not tags written into the scenes. It maps each scene name to its environment, such as `sceneEnvironments: {"Harbour": "sea", "Smugglers' cave": "cave", "Captain's cabin": null}` (`null`: no side story starts there). It is kept with the review entry and the live copy, pinned in each run's snapshot, and filled in by the reviewer on the review page. The author's text stays untouched, environments never leak into the story's public search tags (today every scene tag also becomes one, `_collect_story_tags`), and the platform can retune them later without a new story version.
- **The LLM only suggests:** it reads the story text, and a story can contain text written to steer it. Its answer is limited to the fixed list and one environment per scene, and the reviewer confirms it.
- **The server rolls fresh,** when it handles the click, and nothing about the roll is stored in advance, so nobody can work it out ahead. The step counter already makes sure a saved click never runs again (a lost answer sent again or a double click gets the current state); a click that failed before its result was saved (a crash, an engine time-out) simply rolls again when it is sent again. The same goes for skill checks and fights. (A story's own `random()` and `either()` work the same way at a click: the scene they pick is saved, nothing repeats. Only a number drawn while a scene is shown needs care, because the engine shows that scene again on the next click; see "Random numbers in a story" in the engine document.)
- **Where it can happen:** only in the main story's own scenes, not in the `Retreat` graph, `StoryInit` or `LastResort`, and never inside a side story (see the depth rule below).

#### Leaving a side story early (decided 2026-11-21)

- **Retreat or an engine failure** (an error or the time limit) inside a side story pops just that side story: the character drops back into the parked story, and the remembered click is applied as after any other pop.
- **The result word** says why, so the story below can react if it wants to: "fled" after Retreat, "failed" after an engine failure.
- **Only the bottom story** ends the run this way: Retreat there is the run's `run_away`, an engine failure there sends it to `LastResort`.
- Retreat out of a fight belongs to the fight rules (see "Skill check and fight commands" under "Open decisions").

Rules still to decide (recommendations in brackets):

| Question | Recommendation |
|---|---|
| How deep may it go? | [At most 3: story → side story → fight. No side story inside a side story; a fight is always the top.] |
| Does a side story need a matching familiar or companion in the party, or can it introduce one (anyone at sea may meet the dolphin)? | [Open: depends on what side stories are for.] |
| How many side stories per run? | [At most one per run, and never the same side story twice in one run.] |
| Who pays | [Only the bottom story takes a run. A side story takes none and isn't counted in `completedStories`.] |
| Legend from side stories | [Each side story has its own points per character, like any story, so a side story met again can't be farmed.] |
| What a side story returns | [One outcome word chosen by its ending, written into the parked frame as `$sideResult`.] |

### Legend and story points

- Story code changes only the characters' Legend, per character with `+=` and `-=`, in at most 2 pairs. The engine reports each character's changes by name; Python applies them by the Legend rules (`backend/legend.py`: pair scale, echoes, limits, written by `change_legend`).
- **Story points:** the story check works out, per pair, the sum of the changes the story writes (at most 10; `legendPoints` on the review entry and the live copy). The first time a character plays the story, Python stores these points for that character with the run counter (`story_plays`), hidden from players. Each applied change uses up its size; a spent pair no longer changes for that character in this story, on any replay. Points are never refilled. A new version is a new story with its own id and points, so review must refuse near-copies of a live story.
- Injuries and other attribute changes come only from Python: skill checks, fights and predefined tags on a scene. Story code never writes character data.

### Runs, endings and recovery

- **Run counter** (`story_plays`): `$meta_access` decides the start (`free` = no counter, `trial` = 1, `paid` = 0; a purchase adds 3). Starting takes a run; a `finished`, `run_away` or `fallen` (the whole party dead, see "When characters die") ending keeps it spent; `LastResort` (`aborted`) or a failed start gives it back.
- **Ending a run:** `_finalize` writes the adventure log, settles the run counter, updates stats, uses up provisions and releases the characters. Only `finished` (an ending of the main story) adds to `completedStories`, which unlocks follow-up stories.
- **Retreat:** with the engine, the play screen offers it while `$meta_allowRunAway` is true in the engine's state (today's step check reads each scene's own `<<set>>` or the `StoryInit` value instead), and the control layer moves the frame to `Retreat`. A run that ends there uses up the run but never counts as completed.
- **LastResort:** with the engine, only the server sends a frame there, when the engine fails (an error or the time limit). Today a step can still ask for it (see "Today's adventure API").

### Test runs

- **Who:** only the story's author and reviewers. The server checks this on start, so a copied link grants nothing.
- **What:** the submitted copy in `twine_review`, pinned like a live story; a resubmit doesn't change a running test. A side story is tested alone, as the bottom frame.
- **Party:** the `TestCharacters` list, which submit checks and keeps with the review copy as a separate field (never in the story text).
- **No effects:** no Legend, injuries, items, XP, completed stories, plays used or stats. Real characters aren't locked.
- **Link:** the editor's submit status shows **Play on server** while the story is submitted.

### What the player receives

- **Scene HTML, cleaned:** the visible text and the visible labels, nothing behind them. No scripts, no event attributes, no `data-passage` or other link targets, no setters, no `title` or `aria-label` that names a scene, no check name or difficulty, no variable values the scene doesn't print. Clickable elements keep their classes, so the story stylesheet still applies. Image names are rewritten to the bucket URLs.
- **Choices are sent back by their label:** the player's click names the button's or link's visible label, and choice inputs (radio buttons, checkboxes, drop-downs, cycles) name the option text they show, never the value the story stores (for radio buttons and checkboxes, which have no text of their own, still open, see "Open decisions"). The story check makes labels unique: it refuses two links or buttons with the same text in one scene, also in different branches of an `<<if>>`, so a label always names one link and the server knows where it leads from the scene text alone, links and buttons inside `<<for>>`, and two options with the same text in one list (`docs/STORY-RULES.md`). A hotspot has no visible label, and a `<<pick_member>>` button stands for a character, so the server gives these a neutral handle. When the label isn't in the scene any more (random text in the scene, see the engine document), the click is refused and the scene is shown as it is now, instead of running a different choice.
- **The story stylesheet,** applied inside a sealed frame without scripts, so it can't style or reach the rest of the app.
- **Never:** other scenes, variables the scene doesn't print, link destinations, the engine, parked frames or other players' state.
- **Play screen** in the Stories tab: the scene in its frame, its choices, Retreat when allowed, the fight screen when a fight frame is on top, and toolbar buttons to the Stats, Body and Camp tabs. Gear changed on other tabs reaches the story at the next scene, because character data is sent fresh with every click.

### Today's adventure API, and the gate

`backend/adventures.py` already runs the lifecycle (start, pinned versions, run counter, endings, adventure log, recovery), but its step API was built for a story running in the browser: `POST /api/auth/me/adventures/{id}/step` takes `{seq, fromPassage, toPassage, vars}`, and `GET …/story` returns every scene. With a live story that would let anyone:

- read every scene and ending in advance (`GET …/story`)
- step straight to an ending (a `finished` run unlocks follow-up stories)
- step to `LastResort` and get the run back, so a trial or purchased run can be read in full and returned, again and again
- take links inside a false `<<if>>`, and supply the variables

**Gate (2026-11-21):** starting an adventure (`POST /api/auth/me/adventures`, `start_my_adventure`) is for admins only, so approving the first story doesn't open these. No page calls the adventure API yet. Tests: `tests/test_adventure_gate.py`.

**Replacement:** the step takes `{seq, choice, picks}` (the choice and the picks by their labels, see "What the player receives") and the server works out the next scene; `GET …/story` is removed; variables from the browser are never accepted (`serverVars` becomes the character data sent to the engine); `backend/twine_graph.py` stays for the story check (endings, reachable scenes, `Retreat` kept apart) but no longer decides steps. The gate goes when this is in place.

## Engines

- **One click per call:** restore the frame's saved state, set `$char`/`$lead`, apply the picks, click the chosen element, return the scene and the new state. How that works inside SugarCube and jsdom is in the engine document.
- **Story pages cached per snapshot ID** in the parent process, which never runs story code.
- **`engine-live`, shared workers:** a worker plays many clicks of reviewed stories and is restarted every few hundred clicks.
- **`engine-test`, single-use workers:** every click gets a fresh, clean process, discarded afterwards, so an unreviewed story can only damage its own click. A few clean processes are kept started in advance.
- **Limits:** Node's permission model (no child processes, no files beyond its own), a time limit per click (2 seconds) and a memory limit.

## Settings

```bash
# Unreviewed stories: single-use workers, never more than one instance
gcloud run deploy engine-test --image <engine image> --region europe-west1 \
  --service-account engine-sa@thewudlands.iam.gserviceaccount.com \
  --no-allow-unauthenticated --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 1Gi --set-env-vars WORKER_MODE=single-use

# Live stories: shared workers, grows with players
gcloud run deploy engine-live --image <engine image> --region europe-west1 \
  --service-account engine-sa@thewudlands.iam.gserviceaccount.com \
  --no-allow-unauthenticated --min-instances 1 --max-instances 20 \
  --cpu 2 --memory 1Gi --set-env-vars WORKER_MODE=shared

# Only the main service may call the engines
for svc in engine-test engine-live; do
  gcloud run services add-iam-policy-binding $svc --region europe-west1 \
    --member serviceAccount:cloud-run-firestore-sa@thewudlands.iam.gserviceaccount.com \
    --role roles/run.invoker
done
```

Optional on top: `--ingress internal` on both engines, which needs `serverless-wudlands` to send its outgoing traffic through a VPC. The engines' missing internet access must be enforced by the platform (a VPC without a route out), because Node's permission model can't block the network.

## Capacity (estimates)

Measured on a laptop on 2026-11-19; not yet on Cloud Run. An active player clicks about every 20 seconds. Node uses one core, so one worker per vCPU.

| | `engine-live` (shared) | `engine-test` (single-use) |
|---|---|---|
| Memory per worker | about 250 MB at worst, plus about 4 MB per cached story | about 88 MB, only during the click |
| CPU per click | about 0.19 s | 0.19 s plus process start (not measured, about 0.3–0.5 s) |
| One instance | 2 vCPU, 1 GiB: about 10 clicks/s, about 200 players at the same moment | 1 vCPU, 1 GiB: about 2 clicks/s, about 20 testers at the same moment |
| Scaling | Up to 20 instances (raise as needed) | Exactly one instance at most |

A stack adds no engine cost: only the top frame runs, and a parked frame is about 2 KB of saved state in the session document. To measure once a prototype runs: process start time, CPU per click on Cloud Run, memory with large stories.

## Open decisions

| Question | Options |
|---|---|
| Story stack rules | See the table under "The story stack" |
| How a story is marked as a side story | A story setting (such as `$meta_kind`), with the environments it fits; its chance set by the platform at approval |
| Skill check and fight commands | Their syntax; the skills, difficulties and odds (a data file like the foraging rules); what a failure costs; the predefined tags; the editor placeholders |
| Who in a party takes a skill check | The member the player picked with `<<pick_member>>` just before; without a pick the lead, the best-suited character, or every member (each climbs, and some may fall) |
| How radio buttons and checkboxes come back | They have no text of their own (the `<label>` around one is free scene text): require each inside a `<label>` with its own text, unique per variable, and send that text; or give them neutral handles |
| Radio look for `<<pick_member>>` | Radio buttons with the names plus a go-on button, for a pick that sits next to other choices in the scene (such as "use the rope"); only buttons until then |
| LastResort refunds | Refund a run that ends in `LastResort` only when it applied no effects (recommended), or always |
| Party for test runs | Only `TestCharacters`, or also read-only copies of the author's real characters |
| Where testing starts | From Submit (each submit restarts the 7 days and shows in the review queue), or a separate test copy from the editor that skips the queue |
| The undead (`vampire`, `undead`) | How a character is turned: only Python, through a predefined consequence tag or a story setting such as "here the dying rise as vampires", never story code. Whether it can be undone. Special rules for the undead (healing, Soul, light), later |
| Entry rules beyond the life state | Whether the may-enter and may-not-enter lists also take races, race groups, professions or birthsigns (such as a story only for dwarves) |
| Several wallets in one adventure | Later: for now one wallet plays all characters of an adventure. Then it needs invitations, access for every member, a rule for who pays (and who picks a new lead when the lead falls), and polling; recommended: the lead chooses for the group |
| Beta testers | None, or a list of wallets per story with effect-free test runs |

## Order of work

1. ~~Seal the editor's story runs~~, ~~**Save review** for reviewers~~ and ~~the story check with the stored test party~~ (2026-11-20); ~~close the check's gaps found against the real SugarCube, re-check review copies, seal the frame from the network, gate the adventure API~~ (2026-11-21).
2. Engine image with the prototype's shims, both worker modes and the limits; deploy `engine-test` and `engine-live`; measure.
3. Test runs from `twine_review` with `TestCharacters`, no effects, and the **Play on server** link in the submit status.
4. Play screen for players on `engine-live`, replacing today's step API; then lift the gate.
5. Skill checks, `<<pick_member>>`, consequence tags (injuries) and fights in Python, with their story commands and editor placeholders; fights as stack frames.
6. Side stories as stack frames.
