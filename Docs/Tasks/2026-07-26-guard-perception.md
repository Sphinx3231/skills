# Guard Perception & Patrol/Alert States

- **Date:** 2026-07-26
- **Status:** done
- **Director brief:** Player movement and stealth state (`PlayerStealthState.IsConcealed`
  / `OnConcealmentChanged`) exist but nothing reacts to them yet — the game has no
  opposition. Implement the first guard AI: a patrol/alert FSM with vision-cone
  (and optionally hearing) perception that detects the player, respecting the
  player's concealment state. Scope: `GuardPerception` (vision cone via angle +
  distance check, line-of-sight raycast against obstacles, queries
  `PlayerStealthState.IsConcealed` to reduce/deny detection while concealed) and
  a `GuardStateMachine` (Patrol → Suspicious/Investigating → Alert states at
  minimum, waypoint-based patrol). Affected systems: `Assets/Scripts/AI/`,
  consumes `Assets/Scripts/Player/PlayerStealthState.cs` and
  `PlayerMovement.cs` (read-only, no changes to Player scripts expected).
  Constraints: Built-in RP (no Light2D-based vision, use geometric vision cone
  + Physics2D raycasts for line-of-sight/obstacle occlusion), must be
  exercisable in Play Mode in a Sandbox scene (guard + player + at least one
  occluding wall), must not regress `Ping.cs` headless smoke-check or existing
  PlayMode tests. Definition of done: guard patrols between waypoints, detects
  an unconcealed player within its vision cone and unoccluded line-of-sight,
  ignores/reduced-detects a concealed player, transitions Patrol→Alert
  (visible in an inspectable state field or debug log), QA verifies via
  PlayMode tests + Play Mode scene exercise (not just compiles), Director
  review passes, no regressions.

## Research

**1. Vision cone / line-of-sight (2D, Built-in RP, no Light2D)**
- Range: `Physics2D.OverlapCircle(pos, visionRadius, ...)` (or just compare distances directly — only one player exists).
- Cone: `Vector2.Angle(facingDirection, toTarget) <= visionHalfAngle`.
- Occlusion: `Physics2D.Linecast(guardEyePos, playerPos, obstacleLayerMask)` — hit means blocked.
- **Project layer state (confirmed):** `TagManager.asset` has no "Wall"/"Obstacle" layer yet; the Sandbox scene's `Wall_North`/`Wall_East` are both on layer 0 (Default). A dedicated Obstacle layer must be added and the Sandbox walls reassigned — **flagged as a config change**, same category as the Input System migration in the player-movement task.
- Player reference: direct `Transform`/`PlayerStealthState` field reference, not a `playerLayerMask` overlap — avoids needing a "Player" layer since there's only one player.

**2. Guard FSM**
- Recommend: plain `enum GuardState { Patrol, Suspicious, Alert }` + `switch` in Update/FixedUpdate — **not** an `IGuardState` interface pattern. Only 3 states, no per-state data/nesting, no known near-term growth pressure. Cheap to refactor into a state-pattern later if needed (mirrors the movement task's own "don't over-engineer" precedent).
- Patrol→Alert: immediate on direct unoccluded sight of unconcealed player.
- Patrol→Suspicious: partial signal (in-range but not fully in-cone, or brief contact then lost).
- Suspicious→Alert: confirmed sight, or Suspicious timer holds a live signal.
- Suspicious→Patrol: time-based decay — track last-known-position + `suspiciousDuration` timer; guard moves to last-known-position while Suspicious, reverts to Patrol (nearest waypoint) if timer elapses with no re-detection.
- Alert de-escalation: not specified by brief — open question, Director decision below.

**3. Waypoint patrol**
- `Transform[] waypoints` + `patrolSpeed`, `Rigidbody2D`-driven velocity in `FixedUpdate` (same convention as `PlayerMovement.cs`), advance index on distance-threshold arrival, loop. No pathfinding/NavMesh — straight-line between waypoints, matches minimal scope.

**4. `PlayerStealthState` integration (confirmed current file, not just task-log)**
- `IsConcealed` (property) and `OnConcealmentChanged` (event) confirmed present and unchanged at `PlayerStealthState.cs:20,22`.
- Recommend: query `IsConcealed` directly at each detection check (cheap property read) rather than subscribing to the event — no subscribe/unsubscribe lifecycle needed on the guard side.
- Recommend **full deny** (not partial reduction) while concealed: detection check short-circuits to false when `IsConcealed`, via a serialized `concealedDetectionRangeMultiplier = 0f` so partial detection can be dialed in later without a code change. Full deny is simpler, deterministic to test (binary assert), and matches stealth-genre convention.

**5. Testability**
- Mirror `PlayerMovementTests.cs`'s pattern: settable public/serialized fields for player reference + obstacle mask (test-injectable, no scene wiring needed).
- Add a public `CheckDetection()` (or similar) method that runs the cone+range+occlusion logic synchronously and returns/exposes the result — avoids frame-perfect timing in tests, same idea as `SetMoveInput` bypassing normal input read.
- `GuardStateMachine` exposes `CurrentState` publicly for both test assertions and the brief's "inspectable state" requirement.
- Suspicious-duration timer stays a serialized float; tests use `WaitForSeconds` for decay behavior, consistent with existing test style (no time-provider abstraction needed at this scale).

**6. Asmdef**
- `NinjaGame.Player.asmdef` is a normal asmdef (`references: ["Unity.InputSystem"]`), safely referenceable.
- Recommend: new `NinjaGame.AI` asmdef under `Assets/Scripts/AI/`, referencing `NinjaGame.Player` — required because scripts without an asmdef fall back to `Assembly-CSharp`, which an asmdef-having assembly cannot reference (same reason `NinjaGame.Player` needed its own asmdef). **Flagged as a config change** (new asmdef file) but low-risk/purely additive — no manifest/ProjectSettings edits needed.
- `Assets/Scripts/AI/` does not exist yet — clean from-scratch addition.

## Approach

**Decision: adopt all Research recommendations as written.** Enum+switch FSM (Patrol/Suspicious/Alert), Rigidbody2D waypoint patrol, direct-reference vision cone + `Linecast` occlusion, full-deny-while-concealed via `IsConcealed` polling, new `NinjaGame.AI` asmdef, and a new "Obstacle" layer.

**Config changes approved (Director sign-off, no further check-in needed):**
1. **New "Obstacle" layer in `TagManager.asset`**, with `Wall_North`/`Wall_East` in the Sandbox scene reassigned to it. Low-risk, additive, same category as the Input System package migration already approved in the prior task — necessary for `Linecast` occlusion to mean anything.
2. **New `NinjaGame.AI` asmdef** referencing `NinjaGame.Player`. Purely additive, no existing-file edits beyond the new asmdef itself.

**Alert de-escalation (open question Research flagged): Alert decays to Suspicious (not straight to Patrol) after losing sight**, using the same last-known-position + timer mechanism, then Suspicious decays to Patrol per Research's design. Rationale: symmetric with Suspicious→Patrol decay, avoids a guard snapping instantly back to oblivious patrol from full Alert, cheap to implement (same timer/last-known-position fields already needed for Suspicious), and standard for the genre. No new component/abstraction required — same `switch` handles it.

**Rejected alternative:** partial/graduated detection reduction while concealed (vs. full deny) — rejected per Research's reasoning (harder to test deterministically, no current gameplay need for partial detection; the multiplier field keeps this reversible later without a rework).

**Component boundary:** `GuardPerception` (pure sensing: range/cone/occlusion/concealment check, exposes `CheckDetection()`) and `GuardStateMachine` (owns `GuardState`, patrol waypoint movement, timers, consumes `GuardPerception`'s output) — same separation-of-concerns precedent as `PlayerMovement`/`PlayerStealthState` being split for independent reasons to change.

Implementation Agent is to build: `GuardPerception.cs`, `GuardStateMachine.cs`, `NinjaGame.AI.asmdef` (under `Assets/Scripts/AI/`), the "Obstacle" layer + Sandbox wall layer reassignment, a guard-inclusive update to the Sandbox scene (or a new Sandbox scene) with guard + player + occluding wall, and PlayMode tests mirroring `PlayerMovementTests.cs`'s injection style.

## Implementation

**Files created:**
- `NinjaGame/Assets/Scripts/AI/NinjaGame.AI.asmdef` — references `NinjaGame.Player`.
- `NinjaGame/Assets/Scripts/AI/GuardPerception.cs` — pure sensing: range+cone (`Vector2.Angle`) + `Physics2D.Linecast` occlusion vs `obstacleLayerMask`, direct player `Transform`/`PlayerStealthState` references, full-deny while `IsConcealed` (via `concealedDetectionRangeMultiplier = 0f`), synchronous `CheckDetection()`.
- `NinjaGame/Assets/Scripts/AI/GuardStateMachine.cs` — `GuardState { Patrol, Suspicious, Alert }` enum/switch FSM, `Rigidbody2D`-driven waypoint patrol, last-known-position + `suspiciousDuration` timer decay, public `CurrentState`.
- `NinjaGame/Assets/Scenes/Sandbox/GuardPerceptionSandbox.unity` (+`.meta`) — new scene (see deviation #1), player + two Obstacle-layer walls + patrolling guard.
- `NinjaGame/Assets/Tests/PlayMode/GuardPerceptionTests.cs` (5 tests), `GuardStateMachineTests.cs` (2 `UnityTest` coroutine tests).

**Files modified:**
- `NinjaGame/ProjectSettings/TagManager.asset` — added `Obstacle` layer at index 8.
- `NinjaGame/Assets/Editor/SandboxSceneBuilder.cs` — added `BuildGuardPerceptionSandbox()`, `CreateGuard`, layer param on `CreateWall`.
- `NinjaGame/Assets/Tests/PlayMode/NinjaGame.Tests.PlayMode.asmdef` — added `NinjaGame.AI` reference.

**Deviations from approved Approach (Director-reviewed below):**
1. Built a new `GuardPerceptionSandbox.unity` rather than modifying `PlayerMovementSandbox.unity` — isolates this task's scene from the prior task's QA baseline. Both scenes now coexist.
2. `CheckDetection()` returns a `DetectionLevel { None, Partial, Full }` enum, not a bool — needed to distinguish the brief's "partial signal" (→Suspicious) from a confirmed sighting (→Alert). Still synchronous and test-injectable.
3. **Interpretation call flagged for Director attention:** Suspicious→Alert is implemented as *Full* detection → immediate Alert; a repeated/held *Partial* signal instead refreshes the Suspicious decay timer rather than independently escalating. Approach doc's "held signal" language was ambiguous — Implementation picked the simpler, more testable reading.
4. Implementation introduced and self-fixed a `TagManager.asset` YAML formatting bug (missing trailing space on blank layer slots caused a batch-mode parse failure) during its own compile-verification pass — caught and corrected before handoff, documented rather than silently fixed.

**Implementation's own compile verification:** 3 batch-mode `Ping.Run` runs (first two caught/fixed the TagManager issue), final run clean: zero `error CS`, zero TagManager parse errors, `PING_OK` present, exit 0. Separate `BuildGuardPerceptionSandbox` run: `GUARD_SANDBOX_SCENE_BUILT_OK`, exit 0, YAML-verified `Wall_North`/`Wall_East` on layer 8 (Obstacle) and `Guard` GameObject present with full component set. Did not run the PlayMode suite (QA's job) and correctly avoided `-runTests`+`-quit` combo per the prior task's documented gotcha.

## QA iterations

### Attempt 2 (post-fix)
- **Tested:** Full PlayMode suite re-run, direct code inspection of all 3 fixes (zero-distance removal, nearest-waypoint resume, sandbox geometry), `SetUp()` distance/range sanity check, independent occlusion-geometry recomputation from scene YAML, full regression (compile + `Ping.cs`).
- **Result:** PASS
- **Details:** 10/10 PlayMode tests pass, including both previously-failing `GuardStateMachineTests`. Zero-distance special case confirmed genuinely removed with no new divide-by-zero/NaN path. `FindNearestWaypointIndex()` confirmed correct (squared-distance, null-safe) and wired into the real `EnterPatrol()` decay path. Test `SetUp()` confirmed to place the player unambiguously outside detection range (distance 1000 vs. explicit `VisionRange = 6` set in the same method, not relying on an assumed default). Sandbox occlusion independently recomputed from wall collider extents (not trusted from Implementation's report) — genuinely holds across the guard's full patrol lane. Ping smoke check and asmdef wiring still clean. No new issues.

**Overall: PASS after 1 fix-loop iteration.**

### Attempt 1
- **Tested:** Full PlayMode suite (10 tests), `Ping.cs` regression, code inspection of all 4 disclosed deviations, Obstacle-layer/occlusion verification, nearest-waypoint-resume check, asmdef sanity.
- **Result:** FAIL (blocking)
- **Details:**
  1. `PlayerMovementTests` 3/3 pass (no regression), `GuardPerceptionTests` 5/5 pass, `GuardStateMachineTests` **0/2 fail**:
     - `Patrol_TransitionsToAlert_OnDirectSightOfUnconcealedPlayer` — fails before player repositioning even happens (`GuardStateMachineTests.cs:58`).
     - `Suspicious_DecaysToPatrol_AfterTimerElapses_WithNoRedetection` (`GuardStateMachineTests.cs:82`).
     - **Root cause:** `SetUp()` spawns guard and player both at world origin (distance 0). `GuardPerception.CheckDetection()` (`GuardPerception.cs:144`) special-cases `distance <= 0.0001f` as an automatic in-cone `Full` detection, so the guard latches to `Alert` before either test's real scenario runs.
  2. `Ping.cs`: PASS, clean.
  3. Deviations #2/#3 confirmed correctly implemented as disclosed. Concealment short-circuit confirmed correct (checked before Linecast, `GuardPerception.cs:118-124,137`). No stuck-state or flicker risk — transitions are timer-gated.
  4. Occlusion test (`GuardPerceptionTests.cs:62-72`) uses a real synthetic collider — solid. Minor note: `GuardPerceptionSandbox.unity`'s default guard/player/wall placement doesn't produce a blocked line-of-sight out of the box for manual Play Mode testing (guard's patrol lane at x=-3 never crosses either wall's footprint from the player's default spawn at origin).
  5. Asmdef wiring: PASS, valid JSON, no orphaned references.
  6. **Undisclosed gap:** nearest-waypoint resume on Patrol decay (explicitly called for in the Approach doc) is not implemented — `EnterPatrol()` (`GuardStateMachine.cs:175-179`) doesn't touch `currentWaypointIndex`, so a guard resumes toward whichever waypoint was active pre-interruption, not the nearest one.

**Fix pass (post-Attempt-1):**
1. Removed the zero-distance special case in `GuardPerception.cs:144` entirely — `Vector2.Angle` already handles near-zero-magnitude division safely internally, so the ternary was both redundant and wrong (it forced always-in-cone at negligible distance, bypassing facing/cone logic exactly where it should matter). Fixed `GuardStateMachineTests.cs` `SetUp()` to spawn player at `(0,1000,0)` (guard stays at origin) so tests start outside detection range, each test repositioning the player into its real scenario before advancing frames — mirrors `PlayerMovementTests.cs`'s isolated-setup style.
2. Implemented `FindNearestWaypointIndex()` in `GuardStateMachine.cs`, called from `EnterPatrol()` — nearest-waypoint resume now matches the approved Approach doc.
3. Moved `GuardPerceptionSandbox.unity`'s player spawn from `(0,0,0)` to `(7,0,0)` — every line from the guard's patrol lane (x=-3, y∈[-3,3]) to the new player position crosses `Wall_East`'s footprint (x∈[4.5,5.5]), so occlusion is now genuinely visible in a live Play Mode session, not just in the isolated unit test.

Implementation's own compile verification clean (zero `error CS`, `PING_OK`, sandbox rebuild `GUARD_SANDBOX_SCENE_BUILT_OK`). Did not run PlayMode suite — routing to QA for re-verification.

**Director decision on fix-loop scope:** fix all three — (a) the zero-distance/co-located-spawn bug (fix in test `SetUp` AND reconsider whether `GuardPerception.cs:144`'s zero-distance special-case is appropriate as production behavior, not just a test artifact — a guard should treat distance-0 as trivially in-range but the *cone* check being skipped entirely is questionable if a facing direction is meaningful at that range), (b) implement nearest-waypoint resume as originally approved (not an accepted scope cut — Approach doc was explicit), (c) reposition `GuardPerceptionSandbox.unity` geometry so a wall genuinely occludes guard→player sightline for manual Play Mode testing. Routing back to Implementation.

## Director sign-off

Reviewed `GuardPerception.cs` and `GuardStateMachine.cs` directly (not just agent summaries):

- **Correctness:** `CheckDetection()`'s ordering is right — concealment short-circuit, then range, then occlusion (`Linecast`), then cone angle, cheapest/most-likely-to-reject checks first, no wasted work while concealed or out of range. Zero-distance fix is correct and well-justified in an inline comment (Unity's `Vector2.Angle` already handles near-zero-magnitude safely; the removed special case was actively wrong, forcing always-in-cone at close range).
- **FSM correctness:** state transitions are timer-gated (no flicker risk), `TickAlert`/`TickSuspicious` correctly refresh `lastKnownPosition`/`decayTimer` on a held signal, and Suspicious→Patrol / Alert→Suspicious decay both funnel through `EnterPatrol()`/`EnterSuspicious()` cleanly. `FindNearestWaypointIndex()` is properly wired into the decay path, not dead code.
- **Minor non-blocking observations (logged, not blocking):** `PatrolMove()` runs once before a same-frame Full/Partial transition, causing a one-frame patrol-style move before the guard switches to `MoveTowards` next tick — cosmetic only. `EnterAlert()` doesn't null-check `perception` before dereferencing `perception.Player`, but it's only reachable when `CheckDetection()` already returned `Full` (which requires non-null `perception` per `FixedUpdate`'s own guard) — safe by invariant, just less explicitly defensive than `EnterSuspicious()`'s equivalent check. Neither warrants a fix-loop iteration.
- **No dead code, consistent naming/conventions** with `PlayerMovement`/`PlayerStealthState` (Rigidbody2D velocity-driven movement, public settable properties for test injection, XML doc comments on public members).
- **Component boundary honored:** `GuardPerception` does no state management, `GuardStateMachine` does no sensing — matches the approved separation.
- **Config changes (Obstacle layer, `NinjaGame.AI` asmdef) verified in place and correctly wired**, no regression to the prior task's `PlayerMovementSandbox.unity` or its test suite (kept fully separate, by design).
- **Process note:** fix loop needed exactly one iteration; QA's second pass correctly re-derived the occlusion geometry independently rather than trusting Implementation's claimed math — good verification discipline, worth continuing on future tasks.

**Task complete.** Guards patrol via waypoints, detect an unconcealed player within a vision cone + unoccluded line-of-sight (full deny while concealed), and transition Patrol→Suspicious→Alert with time-based decay and nearest-waypoint patrol resumption. `CurrentState` is inspectable for future systems (detection meter, UI) to consume. No regressions to player movement/stealth or the `Ping.cs` smoke check.
