import React, { useState } from 'react';
import SignIn from './SignIn';
import SignUp from './SignUp';
import ConfirmSignUp from './ConfirmSignUp';

function AuthContainer({ onAuthenticated }) {
  const [view, setView] = useState('signIn');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <svg width="48" height="48" viewBox="0 0 28 28" className="mx-auto mb-4 text-blade-accent">
            <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
            <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          </svg>
          <h1 className="font-mono font-bold text-blade-logo tracking-[0.08em] text-blade-text">
            FOLIO
          </h1>
        </div>

        <div className="bg-blade-surface border border-blade rounded-blade-card p-8">
          {view === 'signIn' && (
            <SignIn
              onSignIn={onAuthenticated}
              onSwitchToSignUp={() => setView('signUp')}
            />
          )}
          {view === 'signUp' && (
            <SignUp
              onNeedConfirmation={(email, password) => {
                setConfirmEmail(email);
                setConfirmPassword(password);
                setView('confirmSignUp');
              }}
              onSwitchToSignIn={() => setView('signIn')}
            />
          )}
          {view === 'confirmSignUp' && (
            <ConfirmSignUp
              email={confirmEmail}
              password={confirmPassword}
              onConfirmed={() => { setConfirmPassword(''); onAuthenticated(); }}
              onFallbackToSignIn={() => { setConfirmPassword(''); setView('signIn'); }}
              onSwitchToSignIn={() => setView('signIn')}
            />
          )}
        </div>

        <p className="text-center mt-8 font-body text-blade-timestamp text-blade-text-faint tracking-[0.02em]">
          Built with fire and patience.
        </p>
      </div>
    </div>
  );
}

export default AuthContainer;
