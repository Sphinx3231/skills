# Bootstrap Unity Project

- **Date:** 2026-07-25
- **Status:** in progress
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

(pending)

## Implementation

(pending)

## QA iterations

(pending)

## Director sign-off

(pending)
