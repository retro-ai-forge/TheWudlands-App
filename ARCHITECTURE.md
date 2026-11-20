# Architecture: services, rights and decisions

Decided 2026-11-20. How TheWudlands is split into Cloud Run services, what each one may do, and who decides what while a story is played. The engine itself (Node.js + jsdom + SugarCube 2.37.3) is described in `twinejs-integrated/APP_INTEGRATION_HEADLESS.md`. Where that document says one engine service runs all stories in shared processes, or that reviewers test-play in the editor, this document replaces it.

## The three services

| Service | Runs | Status |
|---|---|---|
| `serverless-wudlands` | The whole game: website, Twine editor files, wallet login and the FastAPI backend | Exists |
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

The engines need no database: `serverless-wudlands` loads the story and the saved state, sends them with the click, and saves what comes back. In the 2026-11-19 tests one `<<set>>` line escaped jsdom and ran its own commands. An engine with credentials would hand them to such a story. In particular, story code must never run inside `serverless-wudlands`: every process there can fetch the service account's token from the metadata server.

## Who plays what, where

| Who | Plays | Where the story's code runs | Effects on characters |
|---|---|---|---|
| Player | Live stories | `engine-live` | Yes: Legend, injuries, loot, completed stories, plays used |
| Author | Their own submitted story (test run) | `engine-test` | **None** |
| Reviewer | Submitted stories (test run) | `engine-test` | **None** |
| Author or reviewer in the editor (Test, Run here, Play, Proof) | The story open in their editor | A sealed frame in their own browser | None (no server involved) |

The browser never chooses an engine and never talks to one. It talks only to `serverless-wudlands`.

## `serverless-wudlands` decides everything

The engines only calculate. Every click:

1. **Check the click:** load the session; is it this player's turn, does the step counter match, is the choice offered?
2. **Pick the engine** from where the session's story came from, never from anything the browser sends:
   ```python
   def engine_url(session) -> str:
       return ENGINE_TEST_URL if session["mode"] == "test" else ENGINE_LIVE_URL
   ```
   A story from `twine_live` makes a `live` session, a story from `twine_review` a `test` session.
3. **Send** the snapshot ID (the full story only when the engine doesn't have it cached), the saved SugarCube state, `$char`/`$lead` and the choice.
4. **Read the answer:** the new scene and state, plus what the story asked for: a Legend change, an ending, an ability check, a fight.
5. **Decide:**
   - **Story continues:** save the state (conditional update on `seq`), send the scene to the browser.
   - **Ability check or fight:** roll or fight in Python, write the result into the story's state (such as `$checkPassed`, `$fightWon`), let the engine continue from there.
   - **Side story** (such as a familiar's): park the main story's state unchanged, start the side story as its own session, and on its ending resume the main story with the result passed in.
   - **Ending:** apply Legend, injuries and loot, close the run. A test run applies nothing.
6. **Distrust the engine:** the next scene must be one the story's links allow, Legend changes must stay within the rules and limits, the HTML is cleaned and sizes are limited.

The server only steps in where the story asks it to, with commands the author writes (such as a future `<<fight "goblins">>`) and result variables the author knows. The editor shows placeholders for these commands (for example **Pass** / **Fail** buttons) so both branches can be tested there.

## Engines

- **One click per call:** restore the saved state, set `$char`/`$lead`, click the chosen element, return the scene and the new state.
- **Story pages cached per snapshot ID** in the parent process, which never runs story code.
- **`engine-live`, shared workers:** a worker plays many clicks of reviewed stories and is restarted every few hundred clicks. Each click still gets only its own story and state.
- **`engine-test`, single-use workers:** every click gets a fresh, clean process, discarded afterwards, so an unreviewed story can only damage its own click. A few clean processes are kept started in advance.
- **Limits:** Node's permission model (no child processes, no files beyond its own), a time limit per click (2 seconds) and a memory limit.

## Test runs

- **Who:** only the story's author and reviewers. The server checks this on start, so a copied link grants nothing.
- **What:** the submitted copy in `twine_review`, pinned like a live story; a resubmit doesn't change a running test.
- **Party:** the `TestCharacters` list, which submit checks and keeps with the review copy as a separate field (never in the story text).
- **No effects:** no Legend, injuries, items, XP, completed stories, plays used or stats. Real characters aren't locked.
- **Extra for testers:** the play screen shows what was rolled and checked, and can replay with the same dice.
- **Link:** the editor's submit status shows **Play on server** while the story is submitted. The editor asks the server for the status when it opens a story.

## Twine editor

- **Where it lives:** in `serverless-wudlands`, served as static files at `/twine/` on the app's own address. It needs the backend with the viewer's login (cloud sync, image upload, submit, review copies). It never goes into an engine service.
- **Editing never needs a login;** the editor keeps stories in the browser. The login is needed for cloud save, image upload, submit and loading review copies.
- **Built-in story formats only** (2026-11-20): Paperthin for Proof and SugarCube 2.37.3 for stories. A story format's code runs on the app's address with the viewer's login (its editor extensions and `hydrate`), so the Add story format button is gone and formats added earlier are dropped when the editor loads. A story only names its format; the submit check accepts exactly SugarCube 2.37.3, and review copies always use the built-in one.
- **The 7-day lock only stops submitting.** The author's working copy (`twine_stories`) can always be edited and saved. The submitted copy (`twine_review`) is frozen: replaceable by a new submit for 7 days, then locked until review. A live story is changed only as a new story (Duplicate).

### Sealed frame for every story run (built 2026-11-20)

The editor's buttons that run a story are **Test** (from the start scene), **Run here** (from the selected scene), **Play** (without debug) and **Proof** (a printable text view). All four go through `replaceDom` (`twinejs-integrated/src/util/replace-dom.ts`), which replaces the tab's page with a single frame:

- `sandbox="allow-scripts allow-modals"`, without `allow-same-origin`: the story runs with an empty origin of its own.
- **Its code gets nothing of the viewer's:** no login cookie, no API as the viewer (a request reaches the server without the cookie, and the story can't read the answer), no access to the editor's page or its stored stories, and it can't move the tab elsewhere.
- **The same for everyone:** authors and reviewers, the author's own story, an imported one, a review copy. Nobody has to judge whether a story is safe to run.
- **In-memory storage:** the frame has no browser storage, and SugarCube won't start without it. A small script put in first gives it stores in memory, so the story's own saves and history last as long as the tab.
- Tested in Chromium with SugarCube 2.37.3: the story plays and its buttons and setters work. Reading the cookie, reading the editor's page and moving the tab were refused, and a `POST /api/approve` arrived without the cookie.

### Reviewing a submission

1. **Review** on the review page loads the submission into the reviewer's editor as a review copy (never synced, never submitted).
2. The reviewer reads, edits and uses **Run here** freely: it runs sealed.
3. **Save review** (built 2026-11-20) in the editor's banner, where authors see Submit. The editor saves with the reviewer's login, never the story's code. Backend route `PUT /twine-reviews/{owner}/{storyId}` (`save_twine_review`): reviewers only, only while the story waits for review (after its 7 days, like Approve), the full submit check, images only from the frozen review stage (a review copy can't add any). The submission stays the author's (id, name, IFID, owner wallet; `lastUpdate` untouched, so the 7 days don't restart). Each save is recorded in `reviewEdits` (reviewer wallet and time) and `editedBy`/`editedAt`; the approved record keeps them. Tests: `tests/test_review_edits.py`.
4. **Approve** publishes the saved version.

Authors can't load from `twine_review`, so after an approval with reviewer edits their working copy lacks those edits. Planned later: **Load live version** in the author's story list.

**Play screen** (players and test runs): shows the engine's scene in the same kind of sealed frame and cleans the HTML first (no scripts, no `on...` attributes). Players and reviewers see author-written HTML there.

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

To measure once a prototype runs: process start time, CPU per click on Cloud Run, memory with large stories.

## Open decisions

| Question | Options |
|---|---|
| Party for test runs | Only `TestCharacters`, or also read-only copies of the author's real characters |
| Where testing starts | From Submit (each submit restarts the 7 days and shows in the review queue), or a separate test copy from the editor that skips the queue |
| Check and fight commands | Their syntax, the result variables, and the editor placeholders |
| Side stories | How a side story is started, which variables carry its result back |
| Beta testers | None, or a list of wallets per story with effect-free test runs |

## Order of work

1. ~~Seal the editor's story runs~~, ~~**Save review** for reviewers~~ and ~~the story check (`backend/story_rules.py`) with the stored test party~~ (done 2026-11-20).
2. Engine image with the prototype's shims, both worker modes and the limits; deploy `engine-test` and `engine-live`; measure.
3. Test runs from `twine_review` with `TestCharacters`, no effects, and the **Play on server** link in the submit status.
4. Play screen for players on `engine-live`, replacing today's step API that trusts the browser.
5. Ability checks, dice and fights in Python, with their story commands and editor placeholders.
6. Side stories.
