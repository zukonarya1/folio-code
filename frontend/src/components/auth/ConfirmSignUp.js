import React, { useState, useEffect, useRef } from 'react';
import { confirmSignUp, signIn, resendSignUpCode } from 'aws-amplify/auth';

function ConfirmSignUp({ email, password, onConfirmed, onFallbackToSignIn, onSwitchToSignIn }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      try {
        await signIn({ username: email, password });
        onConfirmed();
      } catch {
        setError('Email verified — please sign in.');
        onFallbackToSignIn();
      }
    } catch (err) {
      if (err.name === 'CodeMismatchException') {
        setError('Incorrect code. Double-check your email and try again.');
      } else if (err.name === 'ExpiredCodeException') {
        setError('Code expired. Request a new one.');
      } else {
        setError('Invalid verification code.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await resendSignUpCode({ username: email });
      setResendStatus('sent');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setResendStatus(''), 3000);
    } catch {
      setResendStatus('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="font-body text-blade-page font-bold text-blade-text text-center">
        Verify Email
      </h2>

      <div className="w-16 h-px bg-blade-border mx-auto opacity-50" />

      <p className="text-center text-blade-body-sm text-blade-text-muted">
        We sent a code to <span className="text-blade-text font-medium">{email}</span>
      </p>

      {error && (
        <div className="bg-blade-accent-subtle border border-blade-accent rounded-blade-input p-3 text-blade-accent text-blade-body-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block font-body text-blade-body-sm font-semibold tracking-[0.1em] uppercase text-blade-text-secondary mb-2">
          Verification Code
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter 6-digit code"
          required
          className="w-full bg-blade-surface border border-blade rounded-blade-input px-4 py-3 text-blade-body-sm text-blade-text placeholder-blade-text-faint font-mono text-center text-lg tracking-[0.3em] focus:outline-none focus:border-blade-accent focus:shadow-blade-glow transition-all duration-[250ms]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full font-body font-semibold text-blade-button tracking-[0.02em] uppercase px-8 py-3 bg-blade-accent text-blade-accent-on-accent rounded-blade-button hover:bg-blade-accent-deep hover:shadow-blade-button transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Verifying...' : 'Verify'}
      </button>

      <p className="text-center text-blade-body-sm text-blade-text-muted">
        {resendStatus === 'sent' ? (
          <span style={{ color: 'var(--blade-success)' }} className="font-body text-blade-timestamp font-semibold tracking-[0.02em] uppercase">
            Code sent!
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendStatus === 'sending'}
            className="text-blade-accent hover:text-blade-accent-deep transition-colors duration-[250ms] font-body tracking-[0.02em] uppercase text-blade-timestamp font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendStatus === 'sending' ? 'Sending...' : 'Resend code'}
          </button>
        )}
        <span className="mx-2 text-blade-text-faint">·</span>
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="text-blade-accent hover:text-blade-accent-deep transition-colors duration-[250ms] font-body tracking-[0.02em] uppercase text-blade-timestamp font-semibold"
        >
          Back to Sign In
        </button>
      </p>
    </form>
  );
}

export default ConfirmSignUp;
