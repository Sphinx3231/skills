# Bootstrap Unity Project

- **Date:** 2026-07-25
- **Status:** in progress (paused before QA — session ended by user request)
- **Director brief:** No Unity project exists yet in this directory. Create the
  foundational Unity project for the ninja stealth game: correct Editor version,
  an organized folder structure (Scripts, Scenes, Prefabs, Art, Editor, etc.)
  that later features will build on, and a verified way to run/exercise the
  project headlessly (batch mode) so QA can actually prove it works rather than
  just "it compiles." Definition of done: project opens/builds cleanly, folder
  structure is in place and documented in CLAUDE.md's Project Conventions
  section, and QA has run a real headless verification (not just file existence).

## Research

**Local Unity installation**
- Installed Editor: `6000.5.5f1` (revision `d16e074b49fd`) — only version installed.
- `Unity.exe` path: `C:\Program Files\Unity\Hub\Editor\6000.5.5f1\Editor\Unity.exe` — confirmed present.
- License: active Unity Personal license, Type: Assigned, Expiration: Unlimited. No activation/prompts blocked batch runs.

**Verified CLI facts** (empirically tested in a throwaway temp project, then deleted)
- Project creation works: `Unity.exe -batchmode -nographics -createProject <path> -quit -logFile <log>` → exit code 0, produces standard `Assets/ Library/ Packages/ ProjectSettings/ UserSettings/ Logs/` structure.
- Headless static-method execution works: `Unity.exe -batchmode -nographics -projectPath <path> -executeMethod Ping.Run -quit -logFile <log>` with `Assets/Editor/Ping.cs` (`Debug.Log("PING_OK")`) → log contains `PING_OK`, exit code 0. This is the mechanism QA will use for headless verification beyond "it compiles."
- Gotcha: on rapid back-to-back batch invocations, saw a transient license-handshake retry (`505 Unsupported protocol version`, `Access token unavailable`) that self-resolved and did not block execution or cause nonzero exit. Worth tolerating/retrying if seen again, not treating as fatal.
- No other errors, prompts, or timeouts.

**Proposed `Assets/` folder structure** (standard Unity convention, adapted for a top-down stealth game):
```
Assets/
  Scripts/
    Player/          # ninja movement, stealth state (crouch/shadow), input handling
    AI/              # guard FSM/behavior, perception (vision cones, hearing), patrol/alert states
    Interaction/     # takedowns, doors, distractions, throwables
    Systems/         # game manager, save/load, level state, detection meter
    UI/              # HUD, menus, alert indicators
    Utils/           # shared helpers, extension methods
  Editor/            # editor-only scripts, custom inspectors, batch-mode/QA hooks
  Scenes/
    Levels/          # actual playable levels
    Sandbox/         # test/prototype scenes for isolated mechanic testing
  Prefabs/
    Player/
    Enemies/
    Interactables/
    Environment/
  Art/
    Sprites/ Materials/ Animations/ Shaders/   (Models/ instead of Sprites/ if 3D)
  Audio/
    Music/ SFX/ Ambience/
  Tilemaps/          # if using 2D Tilemap for level layout (common for top-down stealth)
  Settings/          # ScriptableObject configs — guard patrol data, difficulty tuning, input actions
  Plugins/           # third-party assets/SDKs, isolated
  Tests/
    EditMode/        # pure logic unit tests (detection math, inventory, save data)
    PlayMode/        # runtime behavior tests
```

**Render pipeline fact**: `-createProject` defaults to the **Built-in Render Pipeline** — `Packages/manifest.json` has no URP/2D-render-pipeline/HDRP package, and `GraphicsSettings.asset` shows `m_CustomRenderPipeline: {fileID: 0}` with legacy Built-in-only fields populated. URP/2D (often desirable for stealth games needing dynamic shadow/cover lighting via Light2D) is NOT produced automatically — would require either Hub's 2D/URP template flag at creation or a manual post-creation package migration. Flagged as an explicit decision point, not decided by Research.

**Blockers found**: none. License valid, Editor installed, both CLI paths verified working with clean exit codes.

## Approach

- Create the project via `Unity.exe -batchmode -nographics -createProject NinjaGame -quit -logFile <log>` (verified working by Research) rather than via Hub's GUI/template flags, since it's scriptable, reproducible, and headless.
- **Render pipeline: stay on Built-in for this task**, not URP. URP/2D lighting (Light2D for shadow/cover mechanics) is clearly the better long-term fit for this game, but `-createProject` doesn't produce it, and migrating requires either a Hub template flag (not verified) or manual package manifest changes (untested, adds risk to a bootstrap task). Tradeoff: defer the URP migration to a dedicated future task once shadow/cover gameplay is actually being built, so it can be researched and QA'd on its own rather than bundled into project setup. Bootstrapping stays low-risk and verifiable.
- Folder structure: adopt Research's proposed layout under `Assets/` as-is — it's a standard, well-justified Unity convention with stealth-specific subfolders (AI/perception, Interaction/takedowns) already layered in. No changes needed.
- Keep the `Assets/Editor/Ping.cs` headless-verification script from Research's throwaway test as the permanent QA smoke-check mechanism (`-executeMethod Ping.Run`), since it's the only proven way to verify "it actually runs," not just "it compiles," in this headless environment.
- Update `CLAUDE.md`'s Project Conventions and Current Status sections once the project exists, per the task's definition of done.

## Implementation

Implementation Agent executed the approved approach exactly:

1. Created the project: `Unity.exe -batchmode -nographics -createProject "NinjaGame" -quit -logFile NinjaGame_create.log` → exit 0, "Batchmode quit successfully invoked."
2. Created all 22 target directories under `NinjaGame/Assets/` per the Research layout (Scripts/{Player,AI,Interaction,Systems,UI,Utils}, Editor, Scenes/{Levels,Sandbox}, Prefabs/{Player,Enemies,Interactables,Environment}, Art/{Sprites,Materials,Animations,Shaders}, Audio/{Music,SFX,Ambience}, Tilemaps, Settings, Plugins, Tests/{EditMode,PlayMode}) — verified present via `find`.
3. Added `NinjaGame/Assets/Editor/Ping.cs` (static `Ping.Run()` logging `PING_OK`) as the permanent headless smoke-check script.
4. Reimported via `Unity.exe -batchmode -nographics -projectPath NinjaGame -quit -logFile NinjaGame_reimport.log` → exit 0, no `error CS` matches — script compiles clean.
5. Updated `CLAUDE.md`'s "Project conventions" and "Current status" sections only (left "What this is"/"Working model" untouched) to document Editor version, project location, render pipeline decision, folder layout, and the Ping.cs smoke-check convention.

Files touched: `NinjaGame/Assets/Editor/Ping.cs`, `CLAUDE.md`, `NinjaGame_create.log`, `NinjaGame_reimport.log`.

**Not yet done:** the actual `-executeMethod Ping.Run` smoke invocation (Implementation deliberately left this for QA, per the pipeline split) — so "PING_OK" has not yet been observed from a real headless run of the finished project. QA has not run.

## QA iterations

### Attempt 1
- **Tested:** `Unity.exe -batchmode -nographics -projectPath NinjaGame -executeMethod Ping.Run -quit -logFile NinjaGame_qa_ping.log`, plus folder-structure and CLAUDE.md sanity checks.
- **Result:** PASS
- **Details:**
  1. Smoke check PASS — exit 0, log contains `PING_OK`, clean shutdown.
  2. No compile errors — zero `error CS` matches.
  3. Folder structure PASS — all 22 expected directories present under `NinjaGame/Assets/`.
  4. CLAUDE.md sanity check PASS — Project conventions and Current status match reality.
  5. Log sanity PASS — one benign, pre-existing licensing-handshake `NullReferenceException` (BIOS serial lookup) at startup, before project load; non-fatal, already flagged in Research as expected noise; did not block execution or affect `PING_OK`.

QA flagged one informational note (not a failure, out of scope for this task): a discrepancy between this session's injected system-reminder context (describing an older single-agent "hat-switching" model) and the on-disk `CLAUDE.md` (Studio Hierarchy model). On-disk `CLAUDE.md` is correct/current; noting here in case it resurfaces.

**Overall: PASS. No fix loop needed.**

## Director sign-off

(pending)
