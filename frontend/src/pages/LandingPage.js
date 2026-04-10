import React from 'react';
import { Link } from 'react-router-dom';

function LandingPage({ isDark, onThemeToggle }) {
  return (
    <div className="min-h-screen">
      <nav className="bg-blade-surface border-b border-blade">
        <div className="h-14 max-w-[1400px] mx-auto flex items-center justify-between px-8">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <div className="w-7 h-7 text-blade-accent">
              <svg width="28" height="28" viewBox="0 0 28 28">
                <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
                <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
              </svg>
            </div>
            <span className="font-mono font-bold text-blade-logo tracking-[0.08em] text-blade-text">FOLIO</span>
          </Link>
          <div className="flex items-center gap-4">
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
            <Link to="/login" className="font-body text-blade-body-sm font-semibold text-blade-text-muted hover:text-blade-accent transition-colors duration-150 tracking-[0.02em]">
              Sign In
            </Link>
            <Link to="/login" className="font-body font-semibold text-blade-button tracking-[0.02em] uppercase px-5 py-2.5 bg-blade-accent text-blade-accent-on-accent rounded-blade-button hover:bg-blade-accent-deep hover:shadow-blade-button transition-all duration-[250ms]">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <section className="max-w-[1400px] mx-auto px-8 pt-24 pb-20">
        <div className="max-w-2xl">
          <p className="font-mono text-blade-accent tracking-[0.12em] uppercase text-blade-timestamp mb-4">
            Your documents, understood.
          </p>
          <h1 className="font-mono font-bold text-5xl sm:text-6xl text-blade-text leading-[1.1] mb-6">
            Upload a PDF.<br />Ask it anything.
          </h1>
          <p className="font-body text-blade-body text-blade-text-muted leading-relaxed mb-10 max-w-xl">
            Folio turns textbooks, papers, and notes into a personal knowledge base — with AI-powered search, instant digests, and a chat interface that actually reads your documents.
          </p>
          <Link
            to="/login"
            className="inline-block font-body font-semibold text-blade-button tracking-[0.02em] uppercase px-8 py-3.5 bg-blade-accent text-blade-accent-on-accent rounded-blade-button hover:bg-blade-accent-deep hover:shadow-blade-button transition-all duration-[250ms]"
          >
            Get Started — it's free
          </Link>
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-8 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blade-surface border border-blade rounded-blade-card p-6">
            <p className="font-mono font-bold text-blade-accent tracking-[0.08em] mb-3">DIGEST</p>
            <p className="font-body text-blade-body-sm text-blade-text-muted leading-relaxed">
              Upload any PDF. Folio reads it and produces a structured summary — key concepts, main arguments, and a glossary — in under two minutes.
            </p>
          </div>
          <div className="bg-blade-surface border border-blade rounded-blade-card p-6">
            <p className="font-mono font-bold text-blade-accent tracking-[0.08em] mb-3">ASK</p>
            <p className="font-body text-blade-body-sm text-blade-text-muted leading-relaxed">
              Ask questions in plain language. Folio searches your document semantically, not just by keyword, and quotes the exact passage that answers you.
            </p>
          </div>
          <div className="bg-blade-surface border border-blade rounded-blade-card p-6">
            <p className="font-mono font-bold text-blade-accent tracking-[0.08em] mb-3">COLLECT</p>
            <p className="font-body text-blade-body-sm text-blade-text-muted leading-relaxed">
              Every PDF you upload stays in your Folio. Search across all of them. Your personal knowledge base grows with every document.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-blade">
        <div className="max-w-[1400px] mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-blade-accent">
              <svg width="20" height="20" viewBox="0 0 28 28">
                <polygon points="14,1 27,14 14,27 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="14,6 22,14 14,22 6,14" fill="currentColor" opacity="0.15" />
                <line x1="14" y1="1" x2="14" y2="27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
              </svg>
            </div>
            <span className="font-mono font-bold text-blade-timestamp tracking-[0.08em] text-blade-text-faint">FOLIO</span>
          </div>
          <p className="font-mono text-blade-timestamp text-blade-text-faint tracking-[0.02em]">Built with fire and patience.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
