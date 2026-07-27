using UnityEngine;

namespace NinjaGame.AI
{
    /// <summary>Patrol/Suspicious/Alert states for a guard.</summary>
    public enum GuardState
    {
        Patrol,
        Suspicious,
        Alert
    }

    /// <summary>
    /// Waypoint-patrolling guard FSM. Owns GuardState, patrol movement (driven via
    /// Rigidbody2D velocity in FixedUpdate, same convention as PlayerMovement),
    /// and the last-known-position/timer decay logic. Consumes GuardPerception's
    /// CheckDetection() result but does not do any sensing itself.
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class GuardStateMachine : MonoBehaviour
    {
        [SerializeField]
        private GuardPerception perception;

        [SerializeField]
        private Transform[] waypoints;

        [SerializeField]
        private float patrolSpeed = 2f;

        [SerializeField]
        private float alertMoveSpeed = 3f;

        [Tooltip("Distance at which the guard is considered to have arrived at a waypoint or its destination.")]
        [SerializeField]
        private float arrivalThreshold = 0.15f;

        [Tooltip("How long (seconds) Suspicious/Alert holds a last-known-position with no re-detection before decaying (Suspicious->Patrol, Alert->Suspicious).")]
        [SerializeField]
        private float suspiciousDuration = 3f;

        private Rigidbody2D rb;
        private int currentWaypointIndex;
        private GuardState currentState = GuardState.Patrol;
        private Vector2 lastKnownPosition;
        private float decayTimer;

        /// <summary>Current FSM state, for inspection and tests.</summary>
        public GuardState CurrentState => currentState;

        /// <summary>Last position the player was detected at (valid while Suspicious/Alert).</summary>
        public Vector2 LastKnownPosition => lastKnownPosition;

        public GuardPerception Perception
        {
            get => perception;
            set => perception = value;
        }

        public Transform[] Waypoints
        {
            get => waypoints;
            set => waypoints = value;
        }

        public float SuspiciousDuration
        {
            get => suspiciousDuration;
            set => suspiciousDuration = value;
        }

        private void Awake()
        {
            rb = GetComponent<Rigidbody2D>();
            rb.gravityScale = 0f;
            rb.freezeRotation = true;
        }

        private void FixedUpdate()
        {
            GuardPerception.DetectionLevel detection = perception != null
                ? perception.CheckDetection()
                : GuardPerception.DetectionLevel.None;

            switch (currentState)
            {
                case GuardState.Patrol:
                    TickPatrol(detection);
                    break;
                case GuardState.Suspicious:
                    TickSuspicious(detection);
                    break;
                case GuardState.Alert:
                    TickAlert(detection);
                    break;
            }
        }

        private void TickPatrol(GuardPerception.DetectionLevel detection)
        {
            PatrolMove();

            if (detection == GuardPerception.DetectionLevel.Full)
            {
                EnterAlert();
            }
            else if (detection == GuardPerception.DetectionLevel.Partial)
            {
                EnterSuspicious();
            }
        }

        private void TickSuspicious(GuardPerception.DetectionLevel detection)
        {
            MoveTowards(lastKnownPosition, patrolSpeed);

            if (detection == GuardPerception.DetectionLevel.Full)
            {
                EnterAlert();
                return;
            }

            if (detection == GuardPerception.DetectionLevel.Partial)
            {
                // Held signal: refresh last-known-position and reset the decay timer.
                lastKnownPosition = perception.Player.position;
                decayTimer = suspiciousDuration;
                return;
            }

            decayTimer -= Time.fixedDeltaTime;
            if (decayTimer <= 0f)
            {
                EnterPatrol();
            }
        }

        private void TickAlert(GuardPerception.DetectionLevel detection)
        {
            MoveTowards(lastKnownPosition, alertMoveSpeed);

            if (detection == GuardPerception.DetectionLevel.Full || detection == GuardPerception.DetectionLevel.Partial)
            {
                lastKnownPosition = perception.Player.position;
                decayTimer = suspiciousDuration;
                return;
            }

            decayTimer -= Time.fixedDeltaTime;
            if (decayTimer <= 0f)
            {
                EnterSuspicious();
            }
        }

        private void EnterAlert()
        {
            currentState = GuardState.Alert;
            lastKnownPosition = perception.Player.position;
            decayTimer = suspiciousDuration;
        }

        private void EnterSuspicious()
        {
            currentState = GuardState.Suspicious;

            if (perception != null && perception.Player != null)
            {
                lastKnownPosition = perception.Player.position;
            }

            decayTimer = suspiciousDuration;
        }

        private void EnterPatrol()
        {
            currentState = GuardState.Patrol;
            decayTimer = 0f;
            currentWaypointIndex = FindNearestWaypointIndex();
        }

        /// <summary>
        /// Finds the waypoint closest to the guard's current position, so patrol
        /// resumes toward the nearest point on the route rather than whichever
        /// waypoint happened to be active before the Suspicious/Alert interruption.
        /// </summary>
        private int FindNearestWaypointIndex()
        {
            if (waypoints == null || waypoints.Length == 0)
            {
                return 0;
            }

            Vector2 currentPosition = rb.position;
            int nearestIndex = 0;
            float nearestSqrDistance = float.MaxValue;

            for (int i = 0; i < waypoints.Length; i++)
            {
                if (waypoints[i] == null)
                {
                    continue;
                }

                float sqrDistance = ((Vector2)waypoints[i].position - currentPosition).sqrMagnitude;
                if (sqrDistance < nearestSqrDistance)
                {
                    nearestSqrDistance = sqrDistance;
                    nearestIndex = i;
                }
            }

            return nearestIndex;
        }

        private void PatrolMove()
        {
            if (waypoints == null || waypoints.Length == 0)
            {
                rb.linearVelocity = Vector2.zero;
                return;
            }

            Transform target = waypoints[currentWaypointIndex];
            Vector2 toTarget = (Vector2)target.position - rb.position;

            if (toTarget.magnitude <= arrivalThreshold)
            {
                currentWaypointIndex = (currentWaypointIndex + 1) % waypoints.Length;
                target = waypoints[currentWaypointIndex];
                toTarget = (Vector2)target.position - rb.position;
            }

            Vector2 direction = toTarget.sqrMagnitude > 0.0001f ? toTarget.normalized : Vector2.zero;
            rb.linearVelocity = direction * patrolSpeed;

            if (perception != null && direction != Vector2.zero)
            {
                perception.FacingDirection = direction;
            }
        }

        private void MoveTowards(Vector2 destination, float speed)
        {
            Vector2 toDestination = destination - rb.position;

            if (toDestination.magnitude <= arrivalThreshold)
            {
                rb.linearVelocity = Vector2.zero;
                return;
            }

            Vector2 direction = toDestination.normalized;
            rb.linearVelocity = direction * speed;

            if (perception != null)
            {
                perception.FacingDirection = direction;
            }
        }
    }
}
