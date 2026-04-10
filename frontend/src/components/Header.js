import React, { useState, useEffect, useRef } from 'react';
import UsageWidget from './UsageWidget';
import { deleteUser, fetchAuthSession } from 'aws-amplify/auth';
import { NavLink } from 'react-router-dom';
import awsConfig from '../aws-config';

const navLinkClass = ({ isActive }) =>
  `px-3.5 py-1.5 text-blade-nav font-body rounded-blade-input capitalize tracking-[0.02em] transition-all duration-150 ${
    isActive
      ? 'text-blade-accent bg-blade-accent-subtle font-semibold'
      : 'text-blade-text-muted hover:text-blade-accent'
  }`;

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/documents', label: 'Documents' },
];

function ProfileDropdown({ user, signOut, usage, usageLoading }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const containerRef = useRef(null);
  const showModalRef = useRef(false);

  useEffect(() => {
    showModalRef.current = showModal;
  }, [showModal]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !showModalRef.current) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-blade-button border font-body text-blade-button transition-all duration-150 cursor-pointer ${
          open
            ? 'border-blade-active bg-blade-accent-subtle'
            : 'border-blade bg-blade-surface-raised'
        }`}
      >
        <span className="text-blade-text-secondary truncate max-w-[140px]">
          {user?.signInDetails?.loginId || user?.username}
        </span>
        <span
          className="text-blade-text-faint text-[10px] transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-60 bg-blade-surface border border-blade rounded-blade-panel shadow-blade-card-active z-[150]">
          <div className="px-2.5 py-2 border-b border-blade">
            <p className="font-mono text-[10px] text-blade-text-faint truncate">
              {user?.signInDetails?.loginId || user?.username}
            </p>
          </div>

          <div className="border-t border-blade px-2.5 pt-2.5 pb-1 mt-1">
            <UsageWidget usage={usage} isLoading={usageLoading} />
          </div>

          <div className="border-t border-blade" />

          {feedback && (
            <div className="px-2.5 py-1.5">
              <p className={`text-[11px] font-body ${feedbackError ? 'text-blade-error' : 'text-blade-success'}`}>
                {feedback}
              </p>
            </div>
          )}

          <div className="px-1 py-1 flex flex-col">
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="w-full text-left px-2.5 py-2 font-body text-blade-button text-blade-text-muted rounded-blade-input hover:text-blade-accent hover:bg-blade-accent-subtle transition-all duration-150 cursor-pointer"
            >
              Sign Out
            </button>
            <button
              onClick={() => { setShowModal(true); setOpen(false); }}
              className="w-full text-left px-2.5 py-2 font-body text-blade-button text-blade-error rounded-blade-input hover:bg-blade-accent-subtle transition-all duration-150 cursor-pointer"
            >
              Delete account
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--blade-bg) 80%, transparent)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-80 bg-blade-surface border border-blade rounded-blade-panel p-6 flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blade-accent-subtle border border-blade-active flex items-center justify-center">
                <span className="text-blade-accent text-base leading-none">✕</span>
              </div>
              <p className="font-body font-semibold text-blade-section text-blade-text text-center">Delete your account?</p>
            </div>
            <p className="font-body text-blade-body text-blade-text-muted text-center">
              Your account and all sign-in access will be permanently removed. Your uploaded documents will be deleted and become inaccessible. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 font-body font-semibold text-blade-button text-blade-text-muted border border-blade rounded-blade-button hover:border-blade-active hover:text-blade-text transition-all duration-150 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const session = await fetchAuthSession();
                    const token = session.tokens?.idToken?.toString();
                    if (!token) throw new Error('No auth token');
                    const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;
                    const res = await fetch(`${apiEndpoint}/users/me`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) throw new Error('Data cleanup failed');
                    await deleteUser();
                    signOut();
                  } catch {
                    setFeedbackError(true);
                    setFeedback('Delete failed. Please try again.');
                    setDeleting(false);
                    setShowModal(false);
                  }
                }}
                disabled={deleting}
                className="flex-1 py-2.5 font-body font-semibold text-blade-button text-white bg-blade-error border border-blade-error rounded-blade-button hover:opacity-90 transition-all duration-150 cursor-pointer"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ user, signOut, isDark, onThemeToggle, usage, usageLoading }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-[100] h-14 bg-blade-surface border-b border-blade transition-[background,border-color] duration-[400ms] ease">
      <div className="h-full max-w-[1400px] mx-auto flex items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 text-blade-accent">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
              <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
            </svg>
          </div>
          <span className="font-mono font-bold text-blade-logo tracking-[0.08em] text-blade-text">FOLIO</span>
        </div>
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden sm:flex items-center gap-4">
          <button
            onClick={onThemeToggle}
            className="relative w-11 h-6 rounded-blade-toggle border border-blade bg-blade-toggle-bg cursor-pointer p-0 transition-all duration-250"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="absolute left-[5px] top-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ opacity: isDark ? 0.3 : 0.8 }}>☀</span>
            <span className="absolute right-[5px] top-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ opacity: isDark ? 0.8 : 0.3 }}>☾</span>
            <div
              className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-blade-toggle-knob transition-all duration-300 ease"
              style={{ left: isDark ? 22 : 2, boxShadow: isDark ? '0 0 8px var(--blade-accent-glow)' : '0 1px 3px rgba(0,0,0,0.15)' }}
            />
          </button>
          <ProfileDropdown user={user} signOut={signOut} usage={usage} usageLoading={usageLoading} />
        </div>
        <button
          className="sm:hidden flex flex-col justify-center items-center w-10 h-10 gap-[5px]"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-[2px] bg-blade-text transition-transform duration-200 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
          <span className={`block w-6 h-[2px] bg-blade-text transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-[2px] bg-blade-text transition-transform duration-200 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
        </button>
      </div>
      {menuOpen && (
        <div className="sm:hidden border-t border-blade bg-blade-surface-opaque px-6 pb-4 pt-2 flex flex-col gap-3">
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={closeMenu}>
              {label}
            </NavLink>
          ))}
          <div className="border-t border-blade pt-3 mt-1 flex flex-col gap-3">
            <button
              onClick={onThemeToggle}
              className="relative w-11 h-6 rounded-blade-toggle border border-blade bg-blade-toggle-bg cursor-pointer p-0 transition-all duration-250 self-start"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="absolute left-[5px] top-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ opacity: isDark ? 0.3 : 0.8 }}>☀</span>
              <span className="absolute right-[5px] top-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ opacity: isDark ? 0.8 : 0.3 }}>☾</span>
              <div
                className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-blade-toggle-knob transition-all duration-300 ease"
                style={{ left: isDark ? 22 : 2, boxShadow: isDark ? '0 0 8px var(--blade-accent-glow)' : '0 1px 3px rgba(0,0,0,0.15)' }}
              />
            </button>
            <hr style={{ border: 'none', borderTop: '1px solid var(--blade-border)', margin: '4px 0' }} />
            <UsageWidget usage={usage} isLoading={usageLoading} />
            <span className="font-mono text-blade-timestamp text-blade-text-faint">{user?.signInDetails?.loginId || user?.username}</span>
            <button
              onClick={() => { closeMenu(); signOut(); }}
              className="font-body font-semibold text-blade-button tracking-[0.02em] px-4 py-2.5 bg-blade-surface-raised text-blade-text-muted border border-blade rounded-blade-button hover:text-blade-accent hover:border-blade-active transition-all duration-150 cursor-pointer self-start"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
