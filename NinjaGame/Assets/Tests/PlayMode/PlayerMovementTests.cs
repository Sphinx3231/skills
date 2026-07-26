using System.Collections;
using NUnit.Framework;
using NinjaGame.Player;
using UnityEngine;
using UnityEngine.TestTools;

namespace NinjaGame.Tests.PlayMode
{
    public class PlayerMovementTests
    {
        private GameObject playerObject;
        private PlayerMovement playerMovement;
        private PlayerStealthState playerStealthState;

        [SetUp]
        public void SetUp()
        {
            playerObject = new GameObject("Player");
            playerObject.AddComponent<Rigidbody2D>();
            playerObject.AddComponent<BoxCollider2D>();
            playerMovement = playerObject.AddComponent<PlayerMovement>();
            playerStealthState = playerObject.AddComponent<PlayerStealthState>();
        }

        [TearDown]
        public void TearDown()
        {
            if (playerObject != null)
            {
                Object.Destroy(playerObject);
            }
        }

        [UnityTest]
        public IEnumerator PlayerMoves_InExpectedDirection_WhenInputSet()
        {
            Vector3 startPosition = playerObject.transform.position;

            playerMovement.SetMoveInput(Vector2.right);

            yield return new WaitForFixedUpdate();
            yield return null;
            yield return new WaitForFixedUpdate();
            yield return null;

            Vector3 endPosition = playerObject.transform.position;

            Assert.Greater(endPosition.x, startPosition.x, "Player should have moved in the positive X direction.");
            Assert.AreEqual(startPosition.y, endPosition.y, 0.001f, "Player should not have moved on the Y axis.");
        }

        [UnityTest]
        public IEnumerator PlayerDoesNotMove_WhenInputIsZero()
        {
            Vector3 startPosition = playerObject.transform.position;

            playerMovement.SetMoveInput(Vector2.zero);

            yield return new WaitForFixedUpdate();
            yield return null;

            Vector3 endPosition = playerObject.transform.position;

            Assert.AreEqual(startPosition, endPosition, "Player should not move when input is zero.");
        }

        [Test]
        public void ToggleCrouch_FlipsIsConcealed_AndFiresEvent()
        {
            bool eventFired = false;
            bool eventValue = false;

            playerStealthState.OnConcealmentChanged += value =>
            {
                eventFired = true;
                eventValue = value;
            };

            Assert.IsFalse(playerStealthState.IsConcealed, "Player should start unconcealed.");

            playerStealthState.ToggleCrouch();

            Assert.IsTrue(playerStealthState.IsConcealed, "IsConcealed should be true after first ToggleCrouch call.");
            Assert.IsTrue(eventFired, "OnConcealmentChanged should have fired.");
            Assert.IsTrue(eventValue, "OnConcealmentChanged should have been invoked with true.");

            eventFired = false;
            playerStealthState.ToggleCrouch();

            Assert.IsFalse(playerStealthState.IsConcealed, "IsConcealed should be false after second ToggleCrouch call.");
            Assert.IsTrue(eventFired, "OnConcealmentChanged should have fired again.");
            Assert.IsFalse(eventValue, "OnConcealmentChanged should have been invoked with false.");
        }
    }
}
