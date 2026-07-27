using System.Collections;
using NinjaGame.AI;
using NinjaGame.Player;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace NinjaGame.Tests.PlayMode
{
    public class GuardStateMachineTests
    {
        private GameObject guardObject;
        private GameObject playerObject;
        private GuardPerception perception;
        private GuardStateMachine stateMachine;

        // Default player spawn, far outside vision range/cone so SetUp() never
        // hands a test a guard that's already latched onto the player before the
        // test's own scenario positions it. Individual tests move the player into
        // range as needed.
        private static readonly Vector3 DefaultOutOfRangePlayerPosition = new Vector3(0f, 1000f, 0f);

        [SetUp]
        public void SetUp()
        {
            guardObject = new GameObject("Guard");
            guardObject.transform.position = Vector3.zero;
            guardObject.AddComponent<Rigidbody2D>();
            perception = guardObject.AddComponent<GuardPerception>();
            stateMachine = guardObject.AddComponent<GuardStateMachine>();

            playerObject = new GameObject("Player");
            playerObject.transform.position = DefaultOutOfRangePlayerPosition;
            playerObject.AddComponent<PlayerStealthState>();

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

        [UnityTest]
        public IEnumerator Patrol_TransitionsToAlert_OnDirectSightOfUnconcealedPlayer()
        {
            Assert.AreEqual(GuardState.Patrol, stateMachine.CurrentState, "Guard should start in Patrol.");

            playerObject.transform.position = new Vector3(0f, 3f, 0f);

            yield return new WaitForFixedUpdate();
            yield return null;

            Assert.AreEqual(GuardState.Alert, stateMachine.CurrentState, "Guard should go straight to Alert on direct unoccluded sight.");
        }

        [UnityTest]
        public IEnumerator Suspicious_DecaysToPatrol_AfterTimerElapses_WithNoRedetection()
        {
            // 60 degrees off facing direction: Partial signal only (outside the 90-degree
            // main cone, inside the 140-degree peripheral cone), which should move
            // Patrol -> Suspicious rather than straight to Alert.
            float distance = 3f;
            float angleDegrees = 60f;
            float radians = angleDegrees * Mathf.Deg2Rad;
            playerObject.transform.position = new Vector3(distance * Mathf.Sin(radians), distance * Mathf.Cos(radians), 0f);

            yield return new WaitForFixedUpdate();
            yield return null;

            Assert.AreEqual(GuardState.Suspicious, stateMachine.CurrentState, "Guard should enter Suspicious on a partial signal.");

            // Remove the signal entirely so the decay timer is not refreshed.
            playerObject.transform.position = new Vector3(1000f, 1000f, 0f);

            yield return new WaitForSeconds(stateMachine.SuspiciousDuration + 0.5f);

            Assert.AreEqual(GuardState.Patrol, stateMachine.CurrentState, "Guard should decay back to Patrol once the suspicious timer elapses with no re-detection.");
        }
    }
}
