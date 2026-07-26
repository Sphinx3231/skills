using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace NinjaGame.Player
{
    /// <summary>
    /// Tracks whether the player is currently crouched/concealed. Exposes
    /// IsConcealed for other systems (guard perception, etc.) to query, and
    /// an OnConcealmentChanged event so those systems can subscribe instead
    /// of polling. Actual shadow/light-based visibility is a future system;
    /// this component only owns the crouch toggle state.
    /// </summary>
    public class PlayerStealthState : MonoBehaviour
    {
        private bool isCrouched;
        private InputAction crouchAction;
        private bool ownsCrouchAction;

        public bool IsConcealed => isCrouched;

        public event Action<bool> OnConcealmentChanged;

        private void Awake()
        {
            crouchAction = new InputAction(name: "Crouch", type: InputActionType.Button);
            crouchAction.AddBinding("<Keyboard>/leftCtrl");
            crouchAction.AddBinding("<Keyboard>/c");
            ownsCrouchAction = true;

            crouchAction.performed += OnCrouchPerformed;
        }

        private void OnEnable()
        {
            crouchAction?.Enable();
        }

        private void OnDisable()
        {
            crouchAction?.Disable();
        }

        private void OnDestroy()
        {
            if (crouchAction != null)
            {
                crouchAction.performed -= OnCrouchPerformed;

                if (ownsCrouchAction)
                {
                    crouchAction.Dispose();
                }
            }
        }

        private void OnCrouchPerformed(InputAction.CallbackContext context)
        {
            ToggleCrouch();
        }

        /// <summary>Flips the crouch/concealment state and fires OnConcealmentChanged.</summary>
        public void ToggleCrouch()
        {
            isCrouched = !isCrouched;
            OnConcealmentChanged?.Invoke(isCrouched);
        }
    }
}
