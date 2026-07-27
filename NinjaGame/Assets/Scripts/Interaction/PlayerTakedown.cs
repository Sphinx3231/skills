using NinjaGame.AI;
using UnityEngine;
using UnityEngine.InputSystem;

namespace NinjaGame.Interaction
{
    /// <summary>
    /// Player-side takedown interaction: on input, finds the nearest takedown-eligible
    /// guard in range and disables it. Eligibility: guard must not be Alert, must be
    /// within interactionRange, and (only while Patrol) must be approached from behind
    /// within behindAngleThreshold of directly-behind. A Suspicious guard is eligible
    /// from any angle within range, since it is already actively hunting the player.
    /// Mirrors PlayerMovement/PlayerStealthState's ad-hoc InputAction convention and
    /// exposes a public TryTakedown(GuardStateMachine) entry point so PlayMode tests
    /// can drive takedowns directly without simulating a real input device.
    /// </summary>
    public class PlayerTakedown : MonoBehaviour
    {
        [Tooltip("Maximum distance from the player to a guard for a takedown to be possible.")]
        [SerializeField]
        private float interactionRange = 1.5f;

        [Tooltip("How close (degrees) to directly-behind the player must be, relative to the guard's facing direction, for a Patrol guard's takedown to be eligible.")]
        [SerializeField]
        private float behindAngleThreshold = 60f;

        private InputAction takedownAction;
        private bool ownsTakedownAction;

        public float InteractionRange
        {
            get => interactionRange;
            set => interactionRange = value;
        }

        public float BehindAngleThreshold
        {
            get => behindAngleThreshold;
            set => behindAngleThreshold = value;
        }

        private void Awake()
        {
            takedownAction = new InputAction(name: "Takedown", type: InputActionType.Button);
            takedownAction.AddBinding("<Keyboard>/f");
            takedownAction.AddBinding("<Gamepad>/buttonWest");
            ownsTakedownAction = true;

            takedownAction.performed += OnTakedownPerformed;
        }

        private void OnEnable()
        {
            takedownAction?.Enable();
        }

        private void OnDisable()
        {
            takedownAction?.Disable();
        }

        private void OnDestroy()
        {
            if (takedownAction != null)
            {
                takedownAction.performed -= OnTakedownPerformed;

                if (ownsTakedownAction)
                {
                    takedownAction.Dispose();
                }
            }
        }

        private void OnTakedownPerformed(InputAction.CallbackContext context)
        {
            GuardStateMachine nearestEligibleGuard = FindNearestEligibleGuard();
            if (nearestEligibleGuard != null)
            {
                TryTakedown(nearestEligibleGuard);
            }
        }

        /// <summary>
        /// Searches every GuardStateMachine currently in the scene and returns the
        /// closest one that is takedown-eligible per IsEligible, or null if none
        /// qualify.
        /// </summary>
        public GuardStateMachine FindNearestEligibleGuard()
        {
            GuardStateMachine[] guards = Object.FindObjectsByType<GuardStateMachine>(FindObjectsSortMode.None);

            GuardStateMachine nearest = null;
            float nearestSqrDistance = float.MaxValue;

            foreach (GuardStateMachine guard in guards)
            {
                if (guard == null || !IsEligible(guard))
                {
                    continue;
                }

                float sqrDistance = ((Vector2)guard.transform.position - (Vector2)transform.position).sqrMagnitude;
                if (sqrDistance < nearestSqrDistance)
                {
                    nearestSqrDistance = sqrDistance;
                    nearest = guard;
                }
            }

            return nearest;
        }

        /// <summary>
        /// Attempts a takedown on the given guard. Returns true and disables the
        /// guard's GuardStateMachine and GuardPerception on success (removing it
        /// from play); returns false with no side effects if the guard is not
        /// currently eligible.
        /// </summary>
        public bool TryTakedown(GuardStateMachine guard)
        {
            if (guard == null || !IsEligible(guard))
            {
                return false;
            }

            guard.enabled = false;

            if (guard.Perception != null)
            {
                guard.Perception.enabled = false;
            }

            return true;
        }

        /// <summary>
        /// Eligibility rule: guard must not be Alert and must be within
        /// interactionRange. A Patrol guard additionally requires the player to be
        /// approached from behind (within behindAngleThreshold of directly-behind
        /// the guard's facing direction); a Suspicious guard is eligible from any
        /// angle within range.
        /// </summary>
        private bool IsEligible(GuardStateMachine guard)
        {
            if (guard.CurrentState == GuardState.Alert)
            {
                return false;
            }

            Vector2 toPlayer = (Vector2)transform.position - (Vector2)guard.transform.position;
            float distance = toPlayer.magnitude;

            if (distance > interactionRange)
            {
                return false;
            }

            if (guard.CurrentState == GuardState.Patrol && !IsBehindGuard(guard, toPlayer))
            {
                return false;
            }

            return true;
        }

        /// <summary>
        /// True if the player (represented by guardToPlayer, the vector from the
        /// guard to the player) is within behindAngleThreshold of directly behind
        /// the guard's current facing direction.
        /// </summary>
        private bool IsBehindGuard(GuardStateMachine guard, Vector2 guardToPlayer)
        {
            if (guard.Perception == null)
            {
                return false;
            }

            float angleFromFacing = Vector2.Angle(guard.Perception.FacingDirection, guardToPlayer);
            return angleFromFacing >= 180f - behindAngleThreshold;
        }
    }
}
