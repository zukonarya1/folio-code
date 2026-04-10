import React, { useState } from 'react';
import { signUp, signInWithRedirect } from 'aws-amplify/auth';

function SignUp({ onNeedConfirmation, onSwitchToSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordRules = [
    { label: 'Minimum 8 characters', passes: password.length >= 8 },
    { label: 'At least one uppercase letter', passes: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', passes: /[a-z]/.test(password) },
    { label: 'At least one number', passes: /[0-9]/.test(password) },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEmailExists(false);
    setLoading(true);
    try {
      const result = await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        onNeedConfirmation(email, password);
      }
    } catch (err) {
      if (err.name === 'UsernameExistsException') {
        setEmailExists(true);
        setError('An account with this email already exists.');
      } else if (err.name === 'InvalidPasswordException') {
        setError('Password doesn\'t meet requirements.');
      } else {
        setError('Could not create account. Check your password requirements.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="font-body text-blade-page font-bold text-blade-text text-center">
        Create Account
      </h2>

      <div className="w-16 h-px bg-blade-border mx-auto opacity-50" />

      {error && (
        <div className="bg-blade-accent-subtle border border-blade-accent rounded-blade-input p-3 text-blade-accent text-blade-body-sm">
          {error}
          {emailExists && (
            <>
              {' '}
              <button
                type="button"
                onClick={onSwitchToSignIn}
                className="underline font-semibold hover:text-blade-accent-deep transition-colors duration-[250ms]"
              >
                Sign in instead?
              </button>
            </>
          )}
        </div>
      )}

      <div>
        <label className="block font-body text-blade-body-sm font-semibold tracking-[0.1em] uppercase text-blade-text-secondary mb-2">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full bg-blade-surface border border-blade rounded-blade-input px-4 py-3 text-blade-body-sm text-blade-text placeholder-blade-text-faint font-body focus:outline-none focus:border-blade-accent focus:shadow-blade-glow transition-all duration-[250ms]"
        />
      </div>

      <div>
        <label className="block font-body text-blade-body-sm font-semibold tracking-[0.1em] uppercase text-blade-text-secondary mb-2">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 chars, upper + lower + number"
          required
          className="w-full bg-blade-surface border border-blade rounded-blade-input px-4 py-3 text-blade-body-sm text-blade-text placeholder-blade-text-faint font-body focus:outline-none focus:border-blade-accent focus:shadow-blade-glow transition-all duration-[250ms]"
        />
        {password.length > 0 && (
          <div className="mt-2 p-3 bg-blade-surface-raised border border-blade rounded-blade-input space-y-1.5 text-blade-body-sm font-body">
            {passwordRules.map((rule) => (
              <div key={rule.label} className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: rule.passes ? 'var(--blade-success)' : 'var(--blade-text-faint)' }}
                />
                <span style={{ color: rule.passes ? 'var(--blade-success)' : 'var(--blade-text-faint)' }}>
                  {rule.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full font-body font-semibold text-blade-button tracking-[0.02em] uppercase px-8 py-3 bg-blade-accent text-blade-accent-on-accent rounded-blade-button hover:bg-blade-accent-deep hover:shadow-blade-button transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating...' : 'Create Account'}
      </button>

      {process.env.REACT_APP_USER_POOL_DOMAIN && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--blade-border)' }} />
            <span className="font-body text-blade-body-sm" style={{ color: 'var(--blade-text-faint)' }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--blade-border)' }} />
          </div>

          <button
            type="button"
            disabled={googleLoading}
            onClick={async () => {
              setGoogleLoading(true);
              try {
                await signInWithRedirect({ provider: 'Google' });
              } catch (err) {
                setError('Google sign-in failed. Please try again.');
              } finally {
                setGoogleLoading(false);
              }
            }}
            className={`w-full flex items-center justify-center gap-3 font-body tracking-[0.02em] px-8 py-3 bg-blade-surface border border-blade rounded-blade-button text-blade-text-muted hover:border-blade-accent hover:text-blade-text transition-all duration-[250ms]${googleLoading ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer'}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>
        </>
      )}

      <p className="text-center text-blade-body-sm text-blade-text-muted">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="text-blade-accent hover:text-blade-accent-deep transition-colors duration-[250ms] font-body tracking-[0.02em] uppercase text-blade-timestamp font-semibold"
        >
          Sign In
        </button>
      </p>
    </form>
  );
}

export default SignUp;
