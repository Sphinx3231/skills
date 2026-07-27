# Stealth Takedown / Guard Interaction

- **Date:** 2026-07-27
- **Status:** done
- **Director brief:** Guards now patrol and detect the player
  (`GuardPerception`/`GuardStateMachine`, `Docs/Tasks/2026-07-26-guard-perception.md`),
  but the player has no way to act on that — the ninja can only be seen, not
  remove a threat. Implement the first stealth takedown: when the player is
  concealed/unconcealed-but-close and approaches a guard from behind (or within
  an interaction range while the guard is not Alert), an interaction prompt/
  action lets the player eliminate or incapacitate the guard, removing it from
  play (or disabling its `GuardStateMachine`/`GuardPerception`). Scope:
  new `Assets/Scripts/Interaction/` (e.g. `TakedownInteractable.cs` or similar
  attached to/paired with a guard, plus any input trigger on the player side).
  Affected systems: `Assets/Scripts/AI/` (read mostly — guard needs to expose
  enough to be "takedown-eligible" and to be disabled on takedown, minimal
  changes only if required), `Assets/Scripts/Player/` (read-only unless an
  interaction-input entry point is strictly required). Constraints: Built-in RP,
  no animation/art assets available yet (this is a functional/logic-first pass,
  not a polished takedown animation), must be exercisable in Play Mode in a
  Sandbox scene, must not regress `Ping.cs` or any existing PlayMode tests
  (player movement, guard perception/state machine). Definition of done: player
  can trigger a takedown on an eligible guard within range or behind it, the
  guard's state machine/perception stops functioning (guard is removed from
  play or disabled) after a successful takedown, takedown is NOT possible on an
  Alert guard (or another explicit, documented eligibility rule), QA verifies
  via PlayMode tests + Play Mode scene exercise, Director review passes, no
  regressions.

## Research

**1. Public API surface available**
- `GuardStateMachine.CurrentState` (`GuardStateMachine.cs:49`) — read-only eligibility gate.
- No existing disable/incapacitate method on either component — must disable via `component.enabled = false` from outside.
- `GuardPerception` exposes `Player`, `PlayerStealthState`, `VisionRange`, `FacingDirection` (`GuardPerception.cs:56-104`); `FacingDirection` is the reusable piece for a behind-guard check. `CheckDetection()` (`GuardPerception.cs:111`) answers the inverse question (can guard see player) and isn't reused directly.
- `PlayerStealthState.IsConcealed`/`OnConcealmentChanged` available but not required by the brief's state+range rule.

**2. Near/behind detection:** separate simple check in the new interaction component, mirroring `GuardPerception`'s own idiom (`Vector2.Angle(guardFacing, toPlayer)` at `GuardPerception.cs:148`, distance vs range) rather than reusing `CheckDetection()`. Read the guard's forward axis via `guardStateMachine.Perception.FacingDirection` (kept live every `FixedUpdate` by `GuardStateMachine.cs:239,258`).

**3. Trigger mechanism:** no shared `.inputactions` asset exists — `PlayerMovement`/`PlayerStealthState` both build ad-hoc `InputAction`s in `Awake()` (`PlayerMovement.cs:52-65`, `PlayerStealthState.cs:26-31`). Follow that pattern for a bound key, plus a public `TryTakedown(GuardStateMachine guard)` method directly callable from tests (same dual-path convention as `PlayerMovement.SetMoveInput()`, `PlayerMovement.cs:104-108`).

**4. Disabling the guard:** `guardStateMachine.enabled = false` (halts `FixedUpdate`, which is the only caller of perception) plus `guardStateMachine.Perception.enabled = false` defensively. No GameObject deactivation (would kill Rigidbody2D/collider) and no new `GuardHealth`/`IsIncapacitated` flag (not required by definition of done).

**5. Eligibility rule:** `guard.CurrentState != GuardState.Alert AND distance(player, guard) <= interactionRange`, with an additional behind-angle requirement (`Vector2.Angle` between guard facing and guard→player vector `>= 180 - behindAngleThreshold`, threshold 60°) only when `CurrentState == Patrol` (not required when `Suspicious`, since a guard already actively looking for the player is a fair target from any angle within range). Simple, testable, matches genre convention.

**6. Asmdef/folder state:** `Assets/Scripts/Interaction/` does not exist yet. New `NinjaGame.Interaction` asmdef needed, referencing `NinjaGame.Player`, `NinjaGame.AI`, and `Unity.InputSystem`. `NinjaGame.Tests.PlayMode.asmdef` needs a new reference to it, same pattern as its existing `NinjaGame.Player`/`NinjaGame.AI` refs.

**7. Test gotcha to avoid repeating:** the guard-perception task's Attempt-1 QA failure was caused by co-locating guard+player at world origin in `SetUp()`. New takedown tests must spawn both at genuinely out-of-range/non-behind positions in `SetUp()` and move into the eligible geometry explicitly per test.

## Approach

**Decision: adopt all Research recommendations as written.** New `Assets/Scripts/Interaction/TakedownInteractable.cs` (or `PlayerTakedown.cs` on the player side — see component-placement note below), state+range(+conditional behind-angle) eligibility rule, disable-both-components on success, ad-hoc bound `InputAction` + public `TryTakedown(GuardStateMachine guard)` test entry point, new `NinjaGame.Interaction` asmdef.

**Component placement:** put the takedown logic on the **player** side (`PlayerTakedown.cs` under `Assets/Scripts/Interaction/`, attached to the player GameObject), not per-guard. Rationale: mirrors `PlayerMovement`/`PlayerStealthState` owning player-side concerns; a single component can query "nearest eligible guard in range" each frame/on input rather than needing one interactable component instance wired to every guard in a scene — simpler scene setup, and consistent with there being exactly one player (same reasoning Research used previously for not needing a Player layer/mask). Player-side component reads guard's `CurrentState` and `Perception.FacingDirection` (public), no new public API needed on `GuardStateMachine`/`GuardPerception`.

**Eligibility rule finalized:** `guard.CurrentState != Alert AND distance <= interactionRange AND (guard.CurrentState != Patrol OR behindAngle check passes)`. Behind-angle threshold and interaction range are serialized fields (tunable, no magic numbers), defaults `interactionRange = 1.5f`, `behindAngleThreshold = 60f` — consistent with `GuardPerception`'s own serialized-tunable convention.

**Rejected alternative:** collision/trigger-volume-based takedown (e.g. a `TakedownZone` trigger collider per guard) — rejected as unnecessary scene-setup complexity for a first, animation-less pass; a direct nearest-guard-in-range query from the player component is simpler to test and simpler to wire into the existing Sandbox scenes.

**Config changes approved (Director sign-off, no further check-in needed):** new `NinjaGame.Interaction` asmdef (purely additive, same category as the prior task's `NinjaGame.AI` asmdef), and a Sandbox scene update/new scene exercising takedown (guard + player positioned so a non-Alert, in-range, behind takedown is reachable in Play Mode) — same category as the guard-perception task's `GuardPerceptionSandbox.unity` addition.

Implementation Agent is to build: `NinjaGame.Interaction.asmdef`, `PlayerTakedown.cs` (public `TryTakedown(GuardStateMachine guard)` + a method to find nearest eligible guard + bound input trigger calling both), a Sandbox scene (new `TakedownSandbox.unity` via `SandboxSceneBuilder.cs`, following the existing builder-method pattern) with player + a Patrol-state guard positioned within interaction range and behind it, and PlayMode tests mirroring `GuardStateMachineTests.cs`'s injection/`SetUp()` style (spawn out-of-range, move into eligible geometry per test) covering: successful takedown on eligible Patrol guard from behind, rejection on Alert guard, rejection when out of range, rejection on Patrol guard not from behind, and (if time allows) success on a Suspicious guard from any angle within range.

## Implementation

**Files created:**
- `NinjaGame/Assets/Scripts/Interaction/NinjaGame.Interaction.asmdef` — references `NinjaGame.Player`, `NinjaGame.AI`, `Unity.InputSystem`, as specified.
- `NinjaGame/Assets/Scripts/Interaction/PlayerTakedown.cs` — `MonoBehaviour` on the player. Public API: `TryTakedown(GuardStateMachine guard)`, `FindNearestEligibleGuard()`, serialized tunables `InteractionRange` (default 1.5f) and `BehindAngleThreshold` (default 60f) exposed as properties. Ad-hoc `InputAction` built in `Awake()` (bound to `<Keyboard>/f` and `<Gamepad>/buttonWest`), enabled/disabled in `OnEnable`/`OnDisable`, disposed in `OnDestroy` — mirrors `PlayerMovement`/`PlayerStealthState`'s exact convention (owns-action bool, performed-callback pattern). `FindNearestEligibleGuard()` uses `Object.FindObjectsByType<GuardStateMachine>(FindObjectsSortMode.None)` (Unity 6 API) to scan the scene and returns the closest guard passing eligibility, or null. `TryTakedown` re-checks eligibility (no TOCTOU trust of caller), then sets `guard.enabled = false` and `guard.Perception.enabled = false` on success — confirmed `GuardStateMachine.Perception` is the correct public accessor name (get/set property, `GuardStateMachine.cs:54-58`) per Research's note to verify. Eligibility rule implemented exactly as specified: not Alert AND distance <= interactionRange AND (not Patrol OR behind-angle check passes); Suspicious/other non-Patrol non-Alert states skip the behind check. Behind check reuses `guard.Perception.FacingDirection` and `Vector2.Angle`, same idiom as `GuardPerception.CheckDetection()`.
- `NinjaGame/Assets/Tests/PlayMode/PlayerTakedownTests.cs` — mirrors `GuardStateMachineTests.cs`'s `SetUp()`/`TearDown()` injection style (guard spawned at origin, player spawned at `(0, 1000, 0)` far out of range, each test moves the player into its own scenario geometry — the SetUp() co-location gotcha from Research point 7 was avoided). 7 tests: success on Patrol guard from behind in range; failure out of range; failure on Patrol guard approached from the front; success/failure via `FindNearestEligibleGuard()`; and two `[UnityTest]` coroutine tests (failure on Alert, success on Suspicious from the front) that drive the guard into Alert/Suspicious first via the same real detection+`WaitForFixedUpdate()` mechanism `GuardStateMachineTests` uses (direct sight / 60-degree peripheral offset), then reposition the player and call `TryTakedown` synchronously without a further FixedUpdate yield so the driven state doesn't decay before the assertion.

**Files modified:**
- `NinjaGame/Assets/Editor/SandboxSceneBuilder.cs` — added `BuildTakedownSandbox()` following `BuildGuardPerceptionSandbox()`'s exact pattern (new empty scene, Obstacle-layer guard check, placeholder sprite, one wall for scene-composition parity, saves to `Assets/Scenes/Sandbox/TakedownSandbox.unity`, logs `TAKEDOWN_SANDBOX_SCENE_BUILT_OK`/`_FAILED`). Player gets a `PlayerTakedown` component added. `CreateGuard(...)` was changed from `void` to return the created `GameObject` (only change to existing shared helper — `BuildGuardPerceptionSandbox`'s call site is a statement so this is source-compatible, non-breaking) so the new builder can read the guard's spawn position and place the player exactly 1 unit "south" of it (opposite the guard's default `Vector2.up` facing direction, since the scene-build script doesn't run Play Mode ticks that would otherwise update `FacingDirection`), landing within the default 1.5-unit `interactionRange` and well inside the default 60-degree `behindAngleThreshold`. Updated the class's top-of-file batchmode-invocation doc comment to mention `BuildTakedownSandbox`.
- `NinjaGame/Assets/Tests/PlayMode/NinjaGame.Tests.PlayMode.asmdef` — added `NinjaGame.Interaction` reference, same pattern as its existing `NinjaGame.Player`/`NinjaGame.AI` entries.

**Deviations from approved Approach:** none. Implemented the eligibility rule, component placement (player-side `PlayerTakedown.cs`), disable-both-components behavior, ad-hoc `InputAction` + public `TryTakedown` test entry point, new asmdef, and Sandbox scene exactly as specified in the Approach section's final paragraph.

**Compile/build verification:**
- `Unity.exe -batchmode -nographics -projectPath NinjaGame -executeMethod Ping.Run -quit -logFile Logs/ping_takedown.log` → exit code 0, log contains `PING_OK`, zero `error CS` occurrences.
- `Unity.exe -batchmode -nographics -projectPath NinjaGame -executeMethod NinjaGame.Editor.SandboxSceneBuilder.BuildTakedownSandbox -quit -logFile Logs/takedown_sandbox_build.log` → exit code 0, log contains `TAKEDOWN_SANDBOX_SCENE_BUILT_OK`, zero `error CS` occurrences. Confirmed `Assets/Scenes/Sandbox/TakedownSandbox.unity` and its `.meta` were written.
- Per instructions, did not run `-runTests`/`-quit` together (documented gotcha from the prior task) — PlayMode test suite execution is left to QA.

## QA iterations

### Attempt 1
- **Tested:** Direct code inspection (`PlayerTakedown.cs`, `NinjaGame.Interaction.asmdef`, `PlayerTakedownTests.cs`, `SandboxSceneBuilder.cs` diff, `NinjaGame.Tests.PlayMode.asmdef`), full PlayMode suite in batch mode, `Ping.Run` headless smoke-check, independent recomputation of `TakedownSandbox.unity` geometry from its YAML (not trusted from Implementation's report).
- **Result:** PASS
- **Details:**
  1. **Eligibility logic (`PlayerTakedown.cs:144-165`) verified correct against the spec** `not Alert AND distance <= interactionRange AND (not Patrol OR behind-angle check passes)`:
     - Alert gate first (`:146-149`), correct short-circuit.
     - Range check uses `distance > interactionRange` → reject, i.e. `<=` is the accept boundary (`:154-157`) — matches "distance <= interactionRange", no off-by-one.
     - Behind-angle check (`IsBehindGuard`, `:172-181`) only gates when `CurrentState == Patrol` (`:159-162`); `GuardState` enum (`GuardStateMachine.cs:6-11`) has exactly `{Patrol, Suspicious, Alert}`, so Suspicious correctly falls through to eligible-from-any-angle within range, matching the Approach doc exactly (no fourth state was silently missed).
     - Angle math: `guardToPlayer` is guard→player; `Vector2.Angle(FacingDirection, guardToPlayer) >= 180 - behindAngleThreshold` correctly identifies "near-opposite of facing" as behind. Verified against the two direct PlayMode tests (front position → angle 0°, rejected; behind position → angle 180°, accepted) and confirms no inverted comparison.
  2. **Null-safety:** `FindNearestEligibleGuard()` with zero guards in scene: loop over empty array, no dereference, returns `null` safely. `guard == null` guarded in both the scan loop and `TryTakedown`. `guard.Perception == null` guarded in both `TryTakedown` and `IsBehindGuard`. No NRE risk found.
  3. **Mid-`FixedUpdate` disable concern:** `TryTakedown` is only ever invoked from the input-performed callback or directly by tests/other code — never from inside `GuardStateMachine.FixedUpdate()` itself, so disabling `guard.enabled`/`guard.Perception.enabled` is not reentrant into an in-progress FixedUpdate call and does not risk mid-loop-iteration corruption (there's also only ever one guard mutated per call, not an iteration being mutated concurrently).
  4. **`TryTakedown` re-checks eligibility itself** (no TOCTOU trust of `FindNearestEligibleGuard`'s result) — confirmed by reading `:120-135` calling `IsEligible` again.
  5. **`CreateGuard` signature change** (`SandboxSceneBuilder.cs:164`, now returns `GameObject`) confirmed source-compatible with `BuildGuardPerceptionSandbox`'s existing statement-form call site (`:73`) — compiles clean, see below.
  6. **PlayMode suite:** 17/17 passed, 0 failed, 0 inconclusive, 0 skipped (`Logs/takedown_playmode_results.xml`, `result="Passed" total="17" passed="17" failed="0"`). Breakdown: `GuardPerceptionTests` 5/5, `GuardStateMachineTests` 2/2, `PlayerMovementTests` 3/3, `PlayerTakedownTests` 7/7 (all 7: success-from-behind-in-range, fail-out-of-range, fail-from-front, `FindNearestEligibleGuard` success/null cases, fail-on-Alert coroutine, success-on-Suspicious-from-front coroutine). No regressions to any pre-existing suite.
  7. **`Ping.Run` smoke-check:** exit code 0, log contains `PING_OK` (1 occurrence), zero `error CS` occurrences (`Logs/takedown_ping.log`).
  8. **`TakedownSandbox.unity` geometry independently recomputed from YAML** (not trusted from Implementation's claim): `Guard` GameObject at `m_LocalPosition: {x: -3, y: -3, z: 0}` (matches `Guard_Waypoint_A`, guard spawns at waypoint A per `CreateGuard`), `GuardPerception.facingDirection: {x: 0, y: 1}` (default, unchanged — scene isn't ticked at build time), `Player` GameObject at `m_LocalPosition: {x: -3, y: -4, z: 0}`. Player-minus-guard = `(0, -1, 0)`: distance 1.0 ≤ `interactionRange` (serialized `1.5` on the scene's `PlayerTakedown` component, confirmed at YAML line 214), and `Vector2.Angle((0,1), (0,-1)) = 180°  ≥ 180 - 60 = 120°` (serialized `behindAngleThreshold: 60`, YAML line 215) — genuinely within range and behind, matching the default-Patrol guard's eligibility rule. A manual Play Mode takedown is reachable, not just scene-build-successful.
  9. Definition of done checked point-by-point: takedown triggerable on an eligible guard (in-range + behind Patrol, or in-range Suspicious) — confirmed via tests and reachable sandbox geometry; guard's state machine/perception stops functioning after success — confirmed both `stateMachine.enabled` and `perception.enabled` become `false` in the two success tests; takedown NOT possible on Alert guard — confirmed via dedicated coroutine test driving a real Alert transition first; no regressions — confirmed via full 17/17 suite pass and clean `Ping.Run`.
  10. No bugs found. No deviations from the approved Approach found beyond what Implementation already disclosed (none disclosed, none found).

**Overall: PASS, no fix-loop iteration needed.**

## Director sign-off

Reviewed `PlayerTakedown.cs` directly (not just agent summaries):

- **Correctness:** `IsEligible()`'s ordering (Alert gate → range → conditional behind-angle) is right, cheapest/most-disqualifying checks first. Range comparison uses `distance > interactionRange` reject, so the accept boundary is genuinely inclusive (`<=`), no off-by-one. `GuardState` has exactly `{Patrol, Suspicious, Alert}`, so the Patrol-only behind-check correctly leaves Suspicious eligible from any angle within range, matching the approved Approach doc's rationale (a guard already hunting the player is a fair target from any direction). Behind-angle math (`Vector2.Angle(FacingDirection, guardToPlayer) >= 180 - behindAngleThreshold`) checked against both the QA-independent sandbox geometry recomputation and the front/behind test pairs — not inverted.
- **Safety:** `TryTakedown()` re-runs `IsEligible()` itself rather than trusting a caller's prior check (no TOCTOU gap between `FindNearestEligibleGuard()` and `TryTakedown()`). Null-checked throughout (`guard`, `guard.Perception`). Disabling `guard.enabled`/`guard.Perception.enabled` is only ever triggered from an input callback or a direct test/API call, never reentrantly from inside `GuardStateMachine.FixedUpdate()` — no mid-loop disable hazard.
- **Component placement honored:** takedown logic lives on the player (`PlayerTakedown`), queries guards by type rather than requiring per-guard wiring — matches the Approach doc's stated reasoning and keeps Sandbox scene setup simple.
- **No dead code, consistent naming/conventions** with `PlayerMovement`/`PlayerStealthState` (ad-hoc `InputAction` in `Awake()`, serialized tunables with tooltips, public settable properties for test injection, XML doc comments on public members). `CreateGuard`'s `void → GameObject` signature change in `SandboxSceneBuilder.cs` is source-compatible and the only call site (`BuildGuardPerceptionSandbox`) was unaffected.
- **Config changes (`NinjaGame.Interaction` asmdef, `TakedownSandbox.unity`, test asmdef reference) verified in place**, no regression to `GuardPerceptionSandbox.unity`/`PlayerMovementSandbox.unity` or their test suites (kept fully separate, consistent with the prior task's precedent).
- **Process note:** QA independently recomputed the Sandbox scene's takedown geometry from YAML (guard at `(-3,-3)` facing `(0,1)`, player at `(-3,-4)`, distance 1.0 ≤ 1.5 range, 180° angle ≥ 120° threshold) rather than trusting Implementation's claim — same verification discipline as the guard-perception task, continuing to pay off. Clean pass, zero fix-loop iterations needed.

**Task complete.** Player can trigger a takedown (bound to `<Keyboard>/f` / gamepad West, or directly via `TryTakedown()`) on the nearest eligible guard: not Alert, within `interactionRange` (1.5 units), and — for a Patrol guard specifically — approached from behind within `behindAngleThreshold` (60°) of the guard's facing direction; a Suspicious guard is eligible from any angle within range. A successful takedown disables both the guard's `GuardStateMachine` and `GuardPerception`, halting its FSM and detection. 17/17 PlayMode tests pass (7 new `PlayerTakedownTests`, no regressions to `GuardStateMachineTests`, `GuardPerceptionTests`, `PlayerMovementTests`), `Ping.cs` smoke-check clean. No regressions to player movement, stealth state, or guard perception/patrol systems.
