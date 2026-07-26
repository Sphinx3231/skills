using UnityEngine;
using UnityEngine.InputSystem;

namespace NinjaGame.Player
{
    /// <summary>
    /// Top-down 8-directional/analog movement driven by Rigidbody2D velocity.
    /// Reads move input from the new Input System (WASD/arrow keys + left stick),
    /// but also exposes a public setter so input can be driven directly from
    /// PlayMode tests without needing device simulation.
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class PlayerMovement : MonoBehaviour
    {
        [SerializeField]
        private float moveSpeed = 5f;

        [SerializeField]
        private InputActionReference moveActionReference;

        private Rigidbody2D rb;
        private InputAction moveAction;
        private bool ownsMoveAction;
        private Vector2 currentInput;
        private bool manualInputOverride;

        public float MoveSpeed
        {
            get => moveSpeed;
            set => moveSpeed = value;
        }

        /// <summary>Current velocity applied to the Rigidbody2D this frame.</summary>
        public Vector2 CurrentVelocity => rb != null ? rb.linearVelocity : Vector2.zero;

        /// <summary>True if the player currently has non-zero movement input.</summary>
        public bool IsMoving => currentInput.sqrMagnitude > 0f;

        private void Awake()
        {
            rb = GetComponent<Rigidbody2D>();
            rb.gravityScale = 0f;
            rb.freezeRotation = true;

            if (moveActionReference != null)
            {
                moveAction = moveActionReference.action;
                ownsMoveAction = false;
            }
            else
            {
                moveAction = new InputAction(name: "Move", type: InputActionType.Value, expectedControlType: "Vector2");
                moveAction.AddCompositeBinding("2DVector")
                    .With("Up", "<Keyboard>/w")
                    .With("Down", "<Keyboard>/s")
                    .With("Left", "<Keyboard>/a")
                    .With("Right", "<Keyboard>/d");
                moveAction.AddCompositeBinding("2DVector")
                    .With("Up", "<Keyboard>/upArrow")
                    .With("Down", "<Keyboard>/downArrow")
                    .With("Left", "<Keyboard>/leftArrow")
                    .With("Right", "<Keyboard>/rightArrow");
                moveAction.AddBinding("<Gamepad>/leftStick");
                ownsMoveAction = true;
            }
        }

        private void OnEnable()
        {
            moveAction?.Enable();
        }

        private void OnDisable()
        {
            moveAction?.Disable();
        }

        private void OnDestroy()
        {
            if (ownsMoveAction)
            {
                moveAction?.Dispose();
            }
        }

        private void Update()
        {
            if (!manualInputOverride && moveAction != null)
            {
                currentInput = moveAction.ReadValue<Vector2>();
            }
        }

        private void FixedUpdate()
        {
            rb.linearVelocity = currentInput.normalized * moveSpeed;
        }

        /// <summary>
        /// Directly sets the current move input, bypassing the Input System.
        /// Intended for PlayMode tests that need deterministic input without
        /// simulating a real input device.
        /// </summary>
        public void SetMoveInput(Vector2 input)
        {
            manualInputOverride = true;
            currentInput = input;
        }
    }
}
