using NinjaGame.AI;
using NinjaGame.Player;
using NUnit.Framework;
using UnityEngine;

namespace NinjaGame.Tests.PlayMode
{
    public class GuardPerceptionTests
    {
        private GameObject guardObject;
        private GameObject playerObject;
        private GuardPerception perception;
        private PlayerStealthState playerStealthState;

        [SetUp]
        public void SetUp()
        {
            guardObject = new GameObject("Guard");
            perception = guardObject.AddComponent<GuardPerception>();

            playerObject = new GameObject("Player");
            playerStealthState = playerObject.AddComponent<PlayerStealthState>();

            perception.Player = playerObject.transform;
            perception.PlayerStealthState = playerStealthState;
            perception.VisionRange = 6f;
            perception.VisionAngle = 90f;
            perception.PeripheralAngle = 140f;
            perception.FacingDirection = Vector2.up;
            perception.ObstacleLayerMask = LayerMask.GetMask("Obstacle");
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
        public void CheckDetection_ReturnsFull_ForUnconcealedPlayer_InConeRangeAndLineOfSight()
        {
            playerObject.transform.position = new Vector3(0f, 3f, 0f);

            GuardPerception.DetectionLevel result = perception.CheckDetection();

            Assert.AreEqual(GuardPerception.DetectionLevel.Full, result);
        }

        [Test]
        public void CheckDetection_ReturnsNone_WhenOccludedByObstacleLayerCollider()
        {
            playerObject.transform.position = new Vector3(0f, 3f, 0f);

            var obstacle = new GameObject("Obstacle");
            obstacle.layer = LayerMask.NameToLayer("Obstacle");
            obstacle.transform.position = new Vector3(0f, 1.5f, 0f);
            var obstacleCollider = obstacle.AddComponent<BoxCollider2D>();
            obstacleCollider.size = new Vector2(4f, 0.5f);

            GuardPerception.DetectionLevel result = perception.CheckDetection();

            Assert.AreEqual(GuardPerception.DetectionLevel.None, result);

            Object.Destroy(obstacle);
        }

        [Test]
        public void CheckDetection_ReturnsNone_WhenPlayerIsConcealed()
        {
            playerObject.transform.position = new Vector3(0f, 3f, 0f);
            playerStealthState.ToggleCrouch();

            Assert.IsTrue(playerStealthState.IsConcealed, "Test setup expected the player to be concealed.");

            GuardPerception.DetectionLevel result = perception.CheckDetection();

            Assert.AreEqual(GuardPerception.DetectionLevel.None, result);
        }

        [Test]
        public void CheckDetection_ReturnsNone_WhenPlayerOutOfRange()
        {
            playerObject.transform.position = new Vector3(0f, 100f, 0f);

            GuardPerception.DetectionLevel result = perception.CheckDetection();

            Assert.AreEqual(GuardPerception.DetectionLevel.None, result);
        }

        [Test]
        public void CheckDetection_ReturnsPartial_ForPlayerInPeripheralConeOnly()
        {
            // 60 degrees off the guard's facing direction (Vector2.up): inside the
            // 140-degree peripheral cone (+/-70) but outside the 90-degree main cone (+/-45).
            float distance = 3f;
            float angleDegrees = 60f;
            float radians = angleDegrees * Mathf.Deg2Rad;
            var offset = new Vector3(distance * Mathf.Sin(radians), distance * Mathf.Cos(radians), 0f);
            playerObject.transform.position = offset;

            GuardPerception.DetectionLevel result = perception.CheckDetection();

            Assert.AreEqual(GuardPerception.DetectionLevel.Partial, result);
        }
    }
}
