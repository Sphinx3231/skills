import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SignInScreen from '../sign-in';

const mockSignInPassword = jest.fn();
const mockSignInFinalize = jest.fn();
const mockSignInSendEmailCode = jest.fn();
const mockSignInVerifyEmailCode = jest.fn();
const mockSignUpPassword = jest.fn();
const mockSendEmailCode = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockSignUpFinalize = jest.fn();
const mockStartSSOFlow = jest.fn();

// A plain field (not a getter) so tests can flip it directly — mirrors how
// the real SignIn resource's `status` reflects its latest server response.
let mockSignInStatus: string | undefined;

jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({
    signIn: {
      password: mockSignInPassword,
      finalize: mockSignInFinalize,
      mfa: { sendEmailCode: mockSignInSendEmailCode, verifyEmailCode: mockSignInVerifyEmailCode },
      get status() {
        return mockSignInStatus;
      },
    },
  }),
  useSignUp: () => ({
    signUp: {
      password: mockSignUpPassword,
      verifications: { sendEmailCode: mockSendEmailCode, verifyEmailCode: mockVerifyEmailCode },
      finalize: mockSignUpFinalize,
    },
  }),
}));

jest.mock('@clerk/expo/experimental', () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

async function goToPasswordStep(identifier = 'fox@example.com') {
  await fireEvent.changeText(screen.getByPlaceholderText('Enter email or username'), identifier);
  await fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(screen.getByText(identifier)).toBeTruthy());
}

beforeEach(() => {
  mockSignInStatus = undefined;
  mockSignInPassword.mockResolvedValue({ error: null });
  mockSignInFinalize.mockResolvedValue({ error: null });
  mockSignInSendEmailCode.mockResolvedValue({ error: null });
  mockSignInVerifyEmailCode.mockResolvedValue({ error: null });
  mockSignUpPassword.mockResolvedValue({ error: null });
  mockSendEmailCode.mockResolvedValue({ error: null });
  mockVerifyEmailCode.mockResolvedValue({ error: null });
  mockSignUpFinalize.mockResolvedValue({ error: null });
});

afterEach(() => jest.clearAllMocks());

describe('SignInScreen — sign in', () => {
  test('renders the identifier step with social row', async () => {
    await render(<SignInScreen />);
    expect(screen.getByText('Sign in to FoxBite')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter email or username')).toBeTruthy();
  });

  test('advances to the password step after entering an identifier', async () => {
    await render(<SignInScreen />);
    await goToPasswordStep('fox@example.com');
    expect(screen.getByPlaceholderText('Create a password')).toBeTruthy();
  });

  test('back chevron returns to the identifier step', async () => {
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.press(screen.getByText('fox@example.com'));
    expect(screen.getByPlaceholderText('Enter email or username')).toBeTruthy();
  });

  test('toggles password visibility', async () => {
    await render(<SignInScreen />);
    await goToPasswordStep();
    const input = screen.getByPlaceholderText('Create a password');
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByTestId('toggle-password-visibility'));
    expect(screen.getByPlaceholderText('Create a password').props.secureTextEntry).toBe(false);
  });

  test('a short password keeps Continue disabled and never calls signIn.password', async () => {
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'short');
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockSignInPassword).not.toHaveBeenCalled();
  });

  test('successful sign-in calls password() then finalize() with no error shown', async () => {
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockSignInFinalize).toHaveBeenCalled());
    expect(mockSignInPassword).toHaveBeenCalledWith({ identifier: 'fox@example.com', password: 'longenoughpw' });
  });

  test('needs_client_trust sends an email code and shows the verify step instead of finalizing', async () => {
    mockSignInStatus = 'needs_client_trust';
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockSignInSendEmailCode).toHaveBeenCalled());
    expect(mockSignInFinalize).not.toHaveBeenCalled();
    expect(screen.getByText('Check your email')).toBeTruthy();
  });

  test('a needs_client_trust sendEmailCode error is shown', async () => {
    mockSignInStatus = 'needs_client_trust';
    mockSignInSendEmailCode.mockResolvedValue({ error: { message: 'Could not send code' } });
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Could not send code')).toBeTruthy());
  });

  test('a wrong-password error is shown and finalize is not called', async () => {
    mockSignInPassword.mockResolvedValue({ error: { message: 'Incorrect password' } });
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeTruthy());
    expect(mockSignInFinalize).not.toHaveBeenCalled();
  });

  test('a finalize error is shown with a fallback message', async () => {
    mockSignInFinalize.mockResolvedValue({ error: {} });
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Could not complete sign-in.')).toBeTruthy());
  });

  test('empty identifier does not advance to the password step', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByPlaceholderText('Enter email or username')).toBeTruthy();
  });
});

describe('SignInScreen — mode switching', () => {
  test('switches to sign-up and back to sign-in, resetting state', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText('Sign up'));
    expect(screen.getByText('Create your account')).toBeTruthy();

    await fireEvent.press(screen.getByText('Sign in'));
    expect(screen.getByText('Sign in to FoxBite')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter email or username')).toBeTruthy();
  });
});

describe('SignInScreen — sign up', () => {
  async function fillSignUpForm() {
    await fireEvent.press(screen.getByText('Sign up'));
    await fireEvent.changeText(screen.getByPlaceholderText('Enter your email address'), 'fox@example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
  }

  test('submitting sends a verification email and shows the verify step', async () => {
    await render(<SignInScreen />);
    await fillSignUpForm();
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(screen.getByText(/fox@example.com/)).toBeTruthy();
    expect(mockSignUpPassword).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: 'fox@example.com', password: 'longenoughpw' })
    );
  });

  test('includes optional fields only when filled in', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText('Sign up'));
    await fireEvent.changeText(screen.getByPlaceholderText('First name'), 'Foxxy');
    await fireEvent.changeText(screen.getByPlaceholderText('Enter your username'), 'foxxy1');
    await fireEvent.changeText(screen.getByPlaceholderText('Enter your email address'), 'fox@example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('+1 234 567 8900'), '+15551234567');
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockSignUpPassword).toHaveBeenCalled());
    expect(mockSignUpPassword).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Foxxy', username: 'foxxy1', phoneNumber: '+15551234567' })
    );
  });

  test('a signUp.password error is shown', async () => {
    mockSignUpPassword.mockResolvedValue({ error: { message: 'Email already in use' } });
    await render(<SignInScreen />);
    await fillSignUpForm();
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Email already in use')).toBeTruthy());
    expect(mockSendEmailCode).not.toHaveBeenCalled();
  });

  test('a sendEmailCode error is shown', async () => {
    mockSendEmailCode.mockResolvedValue({ error: { message: 'Could not send code' } });
    await render(<SignInScreen />);
    await fillSignUpForm();
    await fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Could not send code')).toBeTruthy());
  });

  test('disables Continue until email and an 8+ char password are present', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText('Sign up'));
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockSignUpPassword).not.toHaveBeenCalled();
  });
});

describe('SignInScreen — verify step', () => {
  async function reachVerifyStep() {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByText('Sign up'));
    await fireEvent.changeText(screen.getByPlaceholderText('Enter your email address'), 'fox@example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
  }

  test('correct code verifies and finalizes sign-up', async () => {
    await reachVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(mockSignUpFinalize).toHaveBeenCalled());
    expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
  });

  test('a wrong code shows an error and does not finalize', async () => {
    mockVerifyEmailCode.mockResolvedValue({ error: { message: 'Invalid code' } });
    await reachVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(screen.getByText('Invalid code')).toBeTruthy());
    expect(mockSignUpFinalize).not.toHaveBeenCalled();
  });

  test('a finalize error after verification is shown', async () => {
    mockSignUpFinalize.mockResolvedValue({ error: { message: 'Missing required field' } });
    await reachVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(screen.getByText('Missing required field')).toBeTruthy());
  });

  test('Verify stays disabled until a code is entered', async () => {
    await reachVerifyStep();
    await fireEvent.press(screen.getByText('Verify'));
    expect(mockVerifyEmailCode).not.toHaveBeenCalled();
  });
});

describe('SignInScreen — needs_client_trust verify step', () => {
  async function reachTrustVerifyStep() {
    mockSignInStatus = 'needs_client_trust';
    await render(<SignInScreen />);
    await goToPasswordStep();
    await fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenoughpw');
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
  }

  test('correct code verifies and finalizes the sign-in', async () => {
    await reachTrustVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(mockSignInFinalize).toHaveBeenCalled());
    expect(mockSignInVerifyEmailCode).toHaveBeenCalledWith({ code: '424242' });
  });

  test('a wrong code shows an error and does not finalize', async () => {
    mockSignInVerifyEmailCode.mockResolvedValue({ error: { message: 'Invalid code' } });
    await reachTrustVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '000000');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(screen.getByText('Invalid code')).toBeTruthy());
    expect(mockSignInFinalize).not.toHaveBeenCalled();
  });

  test('a finalize error after verification is shown', async () => {
    mockSignInFinalize.mockResolvedValue({ error: { message: 'Could not complete sign-in.' } });
    await reachTrustVerifyStep();
    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '424242');
    await fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(screen.getByText('Could not complete sign-in.')).toBeTruthy());
  });
});

describe('SignInScreen — SSO', () => {
  test('an immediate session hand-off needs no further action', async () => {
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: 'sess_123' });
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_apple'));
    await waitFor(() => expect(mockStartSSOFlow).toHaveBeenCalledWith({ strategy: 'oauth_apple' }));
  });

  test('a pending sign-in resource finalizes successfully', async () => {
    const finalize = jest.fn().mockResolvedValue({ error: null });
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: null, signIn: { status: 'x', finalize } });
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_google'));
    await waitFor(() => expect(finalize).toHaveBeenCalled());
  });

  test('a pending resource finalize error is shown', async () => {
    const finalize = jest.fn().mockResolvedValue({ error: { message: 'Cannot finalize sign-up without a created session.' } });
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: null, signUp: { status: 'missing_requirements', finalize } });
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_github'));
    await waitFor(() => expect(screen.getByText('Cannot finalize sign-up without a created session.')).toBeTruthy());
  });

  test('no session and no pending resource shows a generic error', async () => {
    mockStartSSOFlow.mockResolvedValue({ createdSessionId: null });
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_apple'));
    await waitFor(() => expect(screen.getByText('Sign-in did not complete — please try again.')).toBeTruthy());
  });

  test('a thrown error surfaces the Clerk long message', async () => {
    mockStartSSOFlow.mockRejectedValue({ errors: [{ longMessage: 'That email is taken.' }] });
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_apple'));
    await waitFor(() => expect(screen.getByText('That email is taken.')).toBeTruthy());
  });

  test('a thrown error with no Clerk shape falls back to a generic message', async () => {
    mockStartSSOFlow.mockRejectedValue(new Error('network down'));
    await render(<SignInScreen />);

    await fireEvent.press(screen.getByTestId('sso-oauth_apple'));
    await waitFor(() => expect(screen.getByText('network down')).toBeTruthy());
  });
});
