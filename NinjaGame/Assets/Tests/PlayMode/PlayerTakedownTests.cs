using System.Collections;
using NinjaGame.AI;
using NinjaGame.Interaction;
using NinjaGame.Player;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NinjaGame.Tests.PlayMode
{
    public class PlayerTakedownTests
    {
        private GameObject guardObject;
        private GameObject playerObject;
        private GuardPerception perception;
        private GuardStateMachine stateMachine;
        private PlayerTakedown playerTakedown;

        // Guard spawns at the origin, player spawns far away so SetUp() never hands
        // a test a guard that's already takedown-eligible (or already detecting the
        // player) before the test's own scenario positions things. Mirrors
        // GuardStateMachineTests' gotcha: guard and player must NOT be co-located/
        // adjacent in SetUp().
        private static readonly Vector3 GuardSpawnPosition = new Vector3(0f, 0f, 0f);
        private static readonly Vector3 DefaultOutOfRangePlayerPosition = new Vector3(0f, 1000f, 0f);

        [SetUp]
        public void SetUp()
        {
            guardObject = new GameObject("Guard");
            guardObject.transform.position = GuardSpawnPosition;
            guardObject.AddComponent<Rigidbody2D>();
            perception = guardObject.AddComponent<GuardPerception>();
            stateMachine = guardObject.AddComponent<GuardStateMachine>();

            playerObject = new GameObject("Player");
            playerObject.transform.position = DefaultOutOfRangePlayerPosition;
            playerObject.AddComponent<PlayerStealthState>();
            playerTakedown = playerObject.AddComponent<PlayerTakedown>();

            perception.Player = playerObject.transform;
            perception.PlayerStealthState = playerObject.GetComponent<PlayerStealthState>();
            perception.VisionRange = 6f;
            perception.VisionAngle = 90f;
            perception.PeripheralAngle = 140f;
            perception.FacingDirection = Vector2.up;
            perception.ObstacleLayerMask = LayerMask.GetMask("Obstacle");

            stateMachine.Perception = perception;
            stateMachine.Waypoints = new Transform[0];
            stateMachine.SuspiciousDuration = 0.3f;

            playerTakedown.InteractionRange = 1.5f;
            playerTakedown.BehindAngleThreshold = 60f;
        }

        [TearDown]
        public void TearDown()
        {
            if (guardObject != null)
            {
                Object.Destroy(guardObject);
            }

            if (playerObject != null)
            {
                Object.Destroy(playerObject);
            }
        }

        [Test]
        public void TryTakedown_Succeeds_OnPatrolGuard_ApproachedFromBehind_InRange()
        {
            Assert.AreEqual(GuardState.Patrol, stateMachine.CurrentState, "Guard should start in Patrol.");

            // Guard faces up (0,1); directly behind is (0,-1) from the guard.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, -1f, 0f);

            bool result = playerTakedown.TryTakedown(stateMachine);

            Assert.IsTrue(result, "Takedown should succeed on a Patrol guard approached from behind within range.");
            Assert.IsFalse(stateMachine.enabled, "Guard's state machine should be disabled after a successful takedown.");
            Assert.IsFalse(perception.enabled, "Guard's perception should be disabled after a successful takedown.");
        }

        [Test]
        public void TryTakedown_Fails_WhenOutOfRange()
        {
            Assert.AreEqual(GuardState.Patrol, stateMachine.CurrentState, "Guard should start in Patrol.");

            // Directly behind the guard's facing direction, but beyond interactionRange.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, -5f, 0f);

            bool result = playerTakedown.TryTakedown(stateMachine);

            Assert.IsFalse(result, "Takedown should fail when the guard is out of interaction range.");
            Assert.IsTrue(stateMachine.enabled, "Guard's state machine should remain enabled when takedown is rejected.");
        }

        [Test]
        public void TryTakedown_Fails_OnPatrolGuard_ApproachedFromFront_InRange()
        {
            Assert.AreEqual(GuardState.Patrol, stateMachine.CurrentState, "Guard should start in Patrol.");

            // Guard faces up (0,1); directly in front is (0,1) from the guard - not behind.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, 1f, 0f);

            bool result = playerTakedown.TryTakedown(stateMachine);

            Assert.IsFalse(result, "Takedown should fail on a Patrol guard not approached from behind.");
            Assert.IsTrue(stateMachine.enabled, "Guard's state machine should remain enabled when takedown is rejected.");
        }

        [Test]
        public void FindNearestEligibleGuard_ReturnsEligibleGuard_WhenInRangeAndBehind()
        {
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, -1f, 0f);

            GuardStateMachine nearest = playerTakedown.FindNearestEligibleGuard();

            Assert.AreEqual(stateMachine, nearest, "FindNearestEligibleGuard should return the eligible guard.");
        }

        [Test]
        public void FindNearestEligibleGuard_ReturnsNull_WhenNoGuardEligible()
        {
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, 1f, 0f);

            GuardStateMachine nearest = playerTakedown.FindNearestEligibleGuard();

            Assert.IsNull(nearest, "FindNearestEligibleGuard should return null when no guard is eligible.");
        }

        [UnityTest]
        public IEnumerator TryTakedown_Fails_OnAlertGuard_EvenFromBehindInRange()
        {
            // Drive the guard into Alert via direct unoccluded sight, same setup
            // GuardStateMachineTests uses for its Patrol->Alert transition test.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, 3f, 0f);

            yield return new WaitForFixedUpdate();
            yield return null;

            Assert.AreEqual(GuardState.Alert, stateMachine.CurrentState, "Test setup expected the guard to reach Alert.");

            // Move to directly behind the guard's facing direction, well within range.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, -1f, 0f);

            bool result = playerTakedown.TryTakedown(stateMachine);

            Assert.IsFalse(result, "Takedown should never succeed on an Alert guard.");
            Assert.IsTrue(stateMachine.enabled, "Guard's state machine should remain enabled when takedown is rejected.");
        }

        [UnityTest]
        public IEnumerator TryTakedown_Succeeds_OnSuspiciousGuard_FromAnyAngle_InRange()
        {
            // Drive the guard into Suspicious via a partial (peripheral-cone) signal,
            // same setup GuardStateMachineTests uses for its Patrol->Suspicious case.
            float distance = 3f;
            float angleDegrees = 60f;
            float radians = angleDegrees * Mathf.Deg2Rad;
            playerObject.transform.position = guardObject.transform.position
                + new Vector3(distance * Mathf.Sin(radians), distance * Mathf.Cos(radians), 0f);

            yield return new WaitForFixedUpdate();
            yield return null;

            Assert.AreEqual(GuardState.Suspicious, stateMachine.CurrentState, "Test setup expected the guard to reach Suspicious.");

            // Directly in front of the guard's facing direction - would fail the
            // behind check for Patrol, but Suspicious guards are eligible from any
            // angle within range.
            playerObject.transform.position = guardObject.transform.position + new Vector3(0f, 1f, 0f);

            bool result = playerTakedown.TryTakedown(stateMachine);

            Assert.IsTrue(result, "Takedown should succeed on a Suspicious guard from any angle within range.");
            Assert.IsFalse(stateMachine.enabled, "Guard's state machine should be disabled after a successful takedown.");
            Assert.IsFalse(perception.enabled, "Guard's perception should be disabled after a successful takedown.");
        }
    }
}
