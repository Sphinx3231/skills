# Player Movement

- **Date:** 2026-07-26
- **Status:** done
- **Director brief:** No gameplay code exists yet. Implement the ninja's core
  top-down movement and a basic stealth state (crouch/shadow toggle) as the
  foundational player system — later systems (guard perception, takedowns,
  detection meter) all depend on the player existing and exposing a stealth
  state to check against. Scope for this task: `PlayerMovement` (top-down
  8-directional or analog movement via Unity's Input System, appropriate speed
  handling) and a `PlayerStealthState` (crouch toggle, exposes an
  `IsConcealed`/visibility-affecting flag other systems can query later —
  actual shadow/light detection is deferred, this just needs to expose the
  state cleanly). Affected systems: `Assets/Scripts/Player/`. Constraints:
  Built-in Render Pipeline (no Light2D dependency yet — that's the deferred
  URP migration), must work with a Rigidbody2D or CharacterController
  appropriate for top-down (Research to confirm which fits a top-down stealth
  game best), must be exercisable in Play Mode in a Sandbox scene. Definition
  of done: player can move in a Sandbox scene, toggle crouch/stealth state,
  QA verifies both via Play Mode (not just compiles), Director review passes,
  no regressions to the existing Ping.cs headless smoke-check.

## Research

**1. Movement approach: Rigidbody2D (Dynamic, velocity-driven) — not CharacterController, not raw Transform**
- `CharacterController` is 3D-only, no 2D equivalent exists. Ruled out.
- Raw `transform.Translate` bypasses physics — won't respect Collider2D collisions with walls/guards without manual overlap checks. Ruled out.
- Recommended: **Rigidbody2D, Dynamic body**, driven via `rigidbody2D.linearVelocity` (renamed from `.velocity` in Unity 6 — confirmed via `Rigidbody2D.linearVelocity` docs) set in `FixedUpdate`, gravity scale 0, Freeze Rotation Z. Set velocity directly (not `AddForce`, which adds acceleration drift). `Collision Detection = Continuous` recommended for reliable guard/wall collision at speed later.

**2. Input System: project currently on legacy Input Manager only**
- `NinjaGame/Packages/manifest.json` has no `com.unity.inputsystem` dependency.
- `ProjectSettings/ProjectSettings.asset` line 682: `activeInputHandler: 0` (0 = legacy only).
- Recommendation: install `com.unity.inputsystem` package, set `activeInputHandler` to 2 (Both) — matches Director brief's explicit ask for Input System and Unity's current default guidance for new projects. **Flagged as a project-configuration change** (manifest edit), not just new scripts — Director approval needed explicitly for this, not just the gameplay code.

**3. Component API shape**
- `PlayerMovement` (`Assets/Scripts/Player/`): `[RequireComponent(typeof(Rigidbody2D))]`, serialized `moveSpeed`, reads `Vector2` input (Input Action asset, normalized 8-directional/analog), caches in `Update`, applies `rb.linearVelocity = input * moveSpeed` in `FixedUpdate`. Expose `IsMoving`/`CurrentVelocity` later for animation hookup (not required now).
- `PlayerStealthState`: no Rigidbody dependency. Private `bool isCrouched`; public `bool IsConcealed => isCrouched`; `ToggleCrouch()` method; optional `OnConcealmentChanged` C# event so guard-perception can subscribe later instead of polling. Kept as a separate component from `PlayerMovement` — speed modulation while crouched is a future integration, not required now.

**4. Play Mode / Sandbox scene setup**
- Minimal scene: "Player" GameObject with `SpriteRenderer` (placeholder sprite), `Rigidbody2D` (Dynamic, gravity 0, freeze rotation), `Collider2D`, `PlayerMovement`, `PlayerStealthState`. Add 1-2 static wall GameObjects with `BoxCollider2D` to manually verify collision. Save under `Assets/Scenes/Sandbox/`.
- PlayMode test (`Assets/Tests/PlayMode/`): instantiate GameObject in code, drive input via a settable public field/method on `PlayerMovement` (avoids needing `InputTestFixture` device simulation for a first pass), step physics with `yield return new WaitForFixedUpdate()`, assert `transform.position` changed in the expected direction and `IsConcealed` toggles correctly.

**5. No conflicts with existing constraints**
- `Assets/Editor/Ping.cs` only calls `Ping.Run()`, doesn't touch scenes — unaffected.
- Rigidbody2D/Collider2D is pure Physics2D (Built-in-RP compatible), no Light2D/URP dependency introduced — respects the deferred-URP decision in CLAUDE.md.

Sources: Unity `Rigidbody2D.linearVelocity` docs (docs.unity3d.com/6000.1), Unity Discussions on Rigidbody2D velocity vs MovePosition, current community guidance on Input System vs legacy Input Manager for new Unity 6.x projects.

## Approach

**Decision: Rigidbody2D (Dynamic, velocity-driven), two separate components (`PlayerMovement` + `PlayerStealthState`), and yes — bundle the Input System migration into this task.**

**Movement: Rigidbody2D over alternatives**
- `CharacterController` is 3D-only — not viable in a 2D project, no real alternative there.
- Raw Transform movement was the only genuine alternative to Rigidbody2D. It's cheaper short-term (no physics setup) but pushes wall/guard collision handling onto manual overlap checks that would have to be rebuilt once guards (Task: guard perception) and interactables (Task: doors/distractions) arrive and need to physically block the player. Since this project is 2D top-down with walls, guards, and later throwables all needing solid collision, Rigidbody2D's built-in Collider2D resolution is the right foundational choice — not over-engineering for hypothetical scale, but avoiding a rebuild that's already known to be needed one task away.
- Gravity scale 0 + Freeze Rotation Z + direct `linearVelocity` assignment (not `AddForce`) keeps behavior deterministic and drift-free, addressing the "no unwanted physics bounce" constraint directly.

**Two components, not one**
- `PlayerMovement` and `PlayerStealthState` are separated because they have different reasons to change and different consumers: movement is tuned by feel (speed, acceleration) and touched by anyone iterating on controls; stealth state is queried by systems that don't exist yet (guard perception) and will grow its own logic (visibility modifiers, shadow detection) independent of movement tuning. Bundling them into one `PlayerController` would mean guard-perception code coupling to a component that also owns physics tuning, and any future crouch-speed-modulation feature would need to reach across an internal boundary instead of composing two public APIs. This is a cheap decision to reverse later (two small components can be merged if the separation proves unnecessary) but the API shape (`IsConcealed`, `OnConcealmentChanged`) is worth getting right now since guard perception will consume it directly next.

**Input System migration: bundle now, don't defer**
- This is the one expensive-to-reverse-ish decision in scope (it's a manifest + ProjectSettings change, not just new scripts). Rejected deferring it because: the Director brief explicitly specified Input System, every future input consumer (menus, interaction prompts, guard-alert QTEs if any) benefits from having it in place from the first input-consuming script rather than retrofitting later, and the migration itself is low-risk (additive package install, `activeInputHandler: 2` keeps legacy working simultaneously so nothing already in the project breaks). Deferring would only save a small amount of setup time now at the cost of a second migration task later. Approved as in-scope for this task.

**Alternatives considered and rejected:** Kinematic Rigidbody2D + `MovePosition` (rejected per Research — stutter on rapid direction changes, manual collision resolution); raw Transform movement (rejected — no physics collision, rebuild risk); single merged `PlayerController` component (rejected — couples unrelated concerns, guard-perception would depend on movement internals).

Implementation Agent is to build exactly: `PlayerMovement`, `PlayerStealthState`, the Input System package install + `activeInputHandler` change, and a Sandbox scene per Research's point 4, matching Research's described API shape.

## Implementation

Implementation Agent executed the approved approach, with one deviation flagged below.

**Files created:**
- `NinjaGame/Assets/Scripts/Player/PlayerMovement.cs` — Rigidbody2D-driven movement per approach, hand-built `InputAction` (2DVector composite, WASD + arrows + gamepad left stick), `rb.linearVelocity = input.normalized * moveSpeed` in `FixedUpdate`. Exposes `CurrentVelocity`, `IsMoving`, and `SetMoveInput(Vector2)` for test injection.
- `NinjaGame/Assets/Scripts/Player/PlayerStealthState.cs` — `IsConcealed`, `ToggleCrouch()`, `OnConcealmentChanged` event, bound to Left Ctrl / C.
- `NinjaGame/Assets/Scripts/Player/NinjaGame.Player.asmdef` — new asmdef referencing `Unity.InputSystem`. Required (not optional): PlayMode test code needs `UnityEngine.TestRunner`, and assemblies with an asmdef can't depend on the predefined `Assembly-CSharp`.
- `NinjaGame/Assets/Tests/PlayMode/NinjaGame.Tests.PlayMode.asmdef` and `PlayerMovementTests.cs` — builds Player GameObject in code, drives via `SetMoveInput`, asserts movement direction + zero-input no-move, asserts `ToggleCrouch()`/`OnConcealmentChanged`.
- `NinjaGame/Assets/Editor/SandboxSceneBuilder.cs` — headless scene constructor following the `Ping.cs` batch-mode precedent (`-executeMethod NinjaGame.Editor.SandboxSceneBuilder.BuildPlayerMovementSandbox`). Generates a placeholder sprite asset, builds Player (SpriteRenderer, Rigidbody2D [Dynamic, gravity 0, FreezeRotation, Continuous], BoxCollider2D, both new components) + two static Wall GameObjects with BoxCollider2D.
- `NinjaGame/Assets/Scenes/Sandbox/PlayerMovementSandbox.unity` — generated, confirmed on disk.

**Files modified:**
- `NinjaGame/Packages/manifest.json` — added `com.unity.inputsystem` and `com.unity.test-framework` (latter wasn't present at all; required for the PlayMode test assembly).
- `NinjaGame/ProjectSettings/ProjectSettings.asset` — `activeInputHandler: 0 → 2` (Both), per approach.

**Deviation from approach (justified, needs Director attention):** approach suggested pinning Input System ~1.11.x; that and 1.14.0 failed to compile against Unity 6000.5.5f1 (`CS0619` — Input System's editor tooling uses `TreeView` APIs Unity 6000.5.5f1 treats as error-level obsolete, not just a warning). Implementation queried the Unity package registry directly and pinned **1.20.0**, which compiles cleanly. `com.unity.test-framework` resolved to 1.7.0.

**Compile verification (Implementation's own check, not QA):**
- Sandbox scene build: exit 0, log shows `SANDBOX_SCENE_BUILT_OK`, zero `error CS` matches.
- Re-ran existing `Ping.cs` smoke check: exit 0, `PING_OK` present, zero `error CS` — no regression to the bootstrap-task deliverable.

**Explicitly not done by Implementation (left for QA per pipeline split):** real device input simulation (WASD/gamepad), visual diagonal-speed check, real Play Mode crouch keypress + double-fire check, actual wall-collision verification in Play Mode, and running the PlayMode test suite itself (only confirmed it compiles).

## QA iterations

### Attempt 1
- **Tested:** Full PlayMode test suite via Unity batch-mode test runner; `Ping.cs` regression check; project-wide compile-error grep; direct YAML inspection of `PlayerMovementSandbox.unity`; code inspection of diagonal-normalization, `OnConcealmentChanged` double-fire risk, and legacy/new Input System conflict risk.
- **Result:** PASS
- **Details:**
  1. PlayMode suite: 3/3 passed (`PlayerDoesNotMove_WhenInputIsZero`, `PlayerMoves_InExpectedDirection_WhenInputSet`, `ToggleCrouch_FlipsIsConcealed_AndFiresEvent`). Note: `-runTests` combined with `-quit` silently no-ops the test runner in this Unity version (process exits before tests run) — QA caught this and re-ran without `-quit`. Worth remembering for future QA passes on this project.
  2. `Ping.cs` smoke check: exit 0, `PING_OK` present — no regression to the bootstrap deliverable.
  3. Zero `error CS` matches across both batch-mode run logs (full project reimport/domain reload in both).
  4. Sandbox scene YAML confirmed: Player has BoxCollider2D + Rigidbody2D + PlayerMovement + PlayerStealthState (script GUIDs cross-checked against `.meta` files); Wall_North/Wall_East each have BoxCollider2D.
  5. Diagonal-speed normalization confirmed correct by code inspection (`.normalized` applied unconditionally before scaling by `moveSpeed`).
  6. `OnConcealmentChanged` double-fire: single subscription in `Awake()`, single unsubscribe in `OnDestroy()`, no double-subscription path found. Flagged as code-inspection-only — real device double-press timing not exercisable headlessly.
  7. `activeInputHandler: 2` conflict check: zero legacy `Input.*` usages anywhere in `Assets/` — no double-handling risk since this is the only input-consuming code so far.

**Explicitly still unverified (real device/GUI, not feasible headlessly):** actual keypress-driven movement feel and crouch toggle in a live Play Mode window. Relied on `SetMoveInput` test injection + code inspection instead, per QA's own note.

**Overall: PASS. No fix loop needed.**

## Director sign-off

Reviewed the diff directly (`PlayerMovement.cs`, `PlayerStealthState.cs`, manifest/ProjectSettings changes, test file):

- **Correctness:** `PlayerMovement.FixedUpdate` applies `currentInput.normalized * moveSpeed` — Unity's `Vector2.normalized` returns `Vector2.zero` safely for a zero vector (no div-by-zero/NaN), so the zero-input case QA tested is correctly handled by the same line that handles movement, not a special case. Diagonal input is correctly normalized before scaling.
- **Component separation honored:** `PlayerStealthState` has no Rigidbody2D/PlayerMovement dependency, exactly as approved — clean boundary for guard-perception to consume later via `IsConcealed`/`OnConcealmentChanged` without coupling to movement internals.
- **Input System lifecycle:** both components correctly pair `OnEnable`/`OnDisable` (Enable/Disable) with `Awake`/`OnDestroy` (create/dispose), and only `Dispose()` the action if they own it (`ownsMoveAction`/`ownsCrouchAction`) rather than one they didn't create — correct, avoids disposing a shared/injected `InputActionReference`'s action.
- **No dead code, no unused abstractions.** `SetMoveInput`'s `manualInputOverride` flag is minimal and does exactly what's needed for test injection without restructuring the input-read path.
- **Naming/conventions:** consistent with `CLAUDE.md`'s `Assets/Scripts/Player/` convention; new asmdef (`NinjaGame.Player`) is a reasonable, justified addition — Implementation correctly flagged why it was required (test assembly needs `TestRunner`, can't be referenced from the predefined `Assembly-CSharp`) rather than silently expanding scope.
- **Package version deviation (1.11.x → 1.20.0) approved retroactively:** justified by a real compile failure (`CS0619`) against this Unity build, verified against the actual package registry rather than guessed. Correct call — pinning a version that doesn't compile would be worse than deviating with a documented reason.
- **Edge cases considered:** guard-perception-facing API (`IsConcealed`, `OnConcealmentChanged`) is stable and won't need rework when that task starts. Legacy/new Input System coexistence (`activeInputHandler: 2`) was verified conflict-free by QA (no other `Input.*` usage in the project yet) — correctly the first and lowest-risk time to make this migration, per the approach's reasoning.
- **Process note carried forward:** QA correctly caught and documented that `-runTests` + `-quit` silently no-ops Unity's batch-mode test runner in this version — worth remembering for all future QA passes on this project, not just this task.

No issues found. QA passed clean on attempt 1 (3/3 PlayMode tests, zero compile errors, no regression to `Ping.cs`), no fix loop was needed.

**Task complete.** Player has working top-down movement and a crouch/concealment state ready for guard-perception to consume. Real-device keypress feel (vs. code-inspected/test-injected behavior) remains formally unverified — acceptable for this task's definition of done, but worth a quick manual sanity check the first time someone opens the Editor GUI, not blocking sign-off.
