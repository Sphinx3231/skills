using NinjaGame.Player;
using UnityEngine;

namespace NinjaGame.AI
{
    /// <summary>
    /// Pure sensing component for a guard: vision-cone + range + line-of-sight
    /// detection of the player, respecting the player's concealment state.
    /// Holds no FSM/state of its own — GuardStateMachine consumes CheckDetection()'s
    /// result and decides what to do with it.
    /// </summary>
    public class GuardPerception : MonoBehaviour
    {
        /// <summary>
        /// Result of a single detection check. Full = direct unoccluded sight
        /// within the main cone. Partial = a weaker signal (in range, in the
        /// wider peripheral cone, but outside the main cone) unoccluded.
        /// None = no signal (out of range, occluded, outside peripheral cone,
        /// or the player is concealed).
        /// </summary>
        public enum DetectionLevel
        {
            None,
            Partial,
            Full
        }

        [SerializeField]
        private Transform player;

        [SerializeField]
        private PlayerStealthState playerStealthState;

        [SerializeField]
        private float visionRange = 6f;

        [Tooltip("Full width (degrees) of the main vision cone. Detections inside this cone are Full.")]
        [SerializeField]
        private float visionAngle = 90f;

        [Tooltip("Full width (degrees) of the wider peripheral cone. Detections inside this but outside visionAngle are Partial.")]
        [SerializeField]
        private float peripheralAngle = 140f;

        [SerializeField]
        private LayerMask obstacleLayerMask;

        [Tooltip("Multiplier applied to visionRange while the player is concealed. 0 = full deny.")]
        [SerializeField]
        private float concealedDetectionRangeMultiplier = 0f;

        [SerializeField]
        private Vector2 facingDirection = Vector2.up;

        /// <summary>Direct reference to the player's Transform. Settable for test injection.</summary>
        public Transform Player
        {
            get => player;
            set => player = value;
        }

        /// <summary>Direct reference to the player's stealth state. Settable for test injection.</summary>
        public PlayerStealthState PlayerStealthState
        {
            get => playerStealthState;
            set => playerStealthState = value;
        }

        public LayerMask ObstacleLayerMask
        {
            get => obstacleLayerMask;
            set => obstacleLayerMask = value;
        }

        public float VisionRange
        {
            get => visionRange;
            set => visionRange = value;
        }

        public float VisionAngle
        {
            get => visionAngle;
            set => visionAngle = value;
        }

        public float PeripheralAngle
        {
            get => peripheralAngle;
            set => peripheralAngle = value;
        }

        /// <summary>Direction the guard is currently facing, used as the cone's forward axis.</summary>
        public Vector2 FacingDirection
        {
            get => facingDirection;
            set
            {
                if (value.sqrMagnitude > 0.0001f)
                {
                    facingDirection = value.normalized;
                }
            }
        }

        /// <summary>
        /// Runs the vision-cone + range + occlusion + concealment check synchronously
        /// and returns the resulting detection level. Safe to call from tests without
        /// waiting on real frame timing.
        /// </summary>
        public DetectionLevel CheckDetection()
        {
            if (player == null)
            {
                return DetectionLevel.None;
            }

            bool concealed = playerStealthState != null && playerStealthState.IsConcealed;
            float effectiveRange = concealed ? visionRange * concealedDetectionRangeMultiplier : visionRange;

            if (effectiveRange <= 0f)
            {
                return DetectionLevel.None;
            }

            Vector2 eyePosition = transform.position;
            Vector2 playerPosition = player.position;
            Vector2 toPlayer = playerPosition - eyePosition;
            float distance = toPlayer.magnitude;

            if (distance > effectiveRange)
            {
                return DetectionLevel.None;
            }

            // Line-of-sight: a hit against the obstacle mask means the view is blocked.
            RaycastHit2D hit = Physics2D.Linecast(eyePosition, playerPosition, obstacleLayerMask);
            if (hit.collider != null)
            {
                return DetectionLevel.None;
            }

            // Vector2.Angle already guards its own division (Unity returns 0 for a
            // near-zero-magnitude input via an internal epsilon check) so no extra
            // zero-distance special case is needed here. Forcing angle = 0 at close
            // range would make the cone check meaningless right where facing arguably
            // matters most (e.g. a guard facing away from an adjacent player).
            float angle = Vector2.Angle(facingDirection, toPlayer);

            if (angle <= visionAngle * 0.5f)
            {
                return DetectionLevel.Full;
            }

            if (angle <= peripheralAngle * 0.5f)
            {
                return DetectionLevel.Partial;
            }

            return DetectionLevel.None;
        }
    }
}
