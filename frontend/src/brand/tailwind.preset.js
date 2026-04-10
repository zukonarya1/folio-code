/** Blade Design System v3 — Tailwind Preset */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        body: ['DM Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },

      colors: {
        blade: {
          bg: 'var(--blade-bg)',
          surface: 'var(--blade-surface)',
          'surface-raised': 'var(--blade-surface-raised)',
          'surface-opaque': 'var(--blade-surface-opaque)',
          border: 'var(--blade-border)',
          'border-active': 'var(--blade-border-active)',
          text: 'var(--blade-text)',
          'text-secondary': 'var(--blade-text-secondary)',
          'text-muted': 'var(--blade-text-muted)',
          'text-faint': 'var(--blade-text-faint)',
          accent: 'var(--blade-accent)',
          'accent-deep': 'var(--blade-accent-deep)',
          'accent-subtle': 'var(--blade-accent-subtle)',
          'accent-glow': 'var(--blade-accent-glow)',
          'accent-on-accent': 'var(--blade-accent-on-accent)',
          secondary: 'var(--blade-secondary)',
          'score-high': 'var(--blade-score-high)',
          'score-mid': 'var(--blade-score-mid)',
          'score-low': 'var(--blade-score-low)',
          'score-min': 'var(--blade-score-min)',
          'bar-track': 'var(--blade-bar-track)',
          'card-hover': 'var(--blade-card-hover)',
          success: 'var(--blade-success)',
          warning: 'var(--blade-warning)',
          error: 'var(--blade-error)',
          'toggle-bg': 'var(--blade-toggle-bg)',
          'toggle-knob': 'var(--blade-toggle-knob)',
        },
      },

      borderColor: {
        blade: {
          DEFAULT: 'var(--blade-border)',
          active: 'var(--blade-border-active)',
        },
      },

      borderRadius: {
        'blade-tag': '4px',
        'blade-input': '6px',
        'blade-button': '8px',
        'blade-card': '10px',
        'blade-panel': '12px',
        'blade-toggle': '12px',
      },

      boxShadow: {
        'blade-card-active': 'var(--blade-shadow-card-active)',
        'blade-button': 'var(--blade-shadow-button)',
        'blade-glow': 'var(--blade-shadow-glow)',
      },

      spacing: {
        'blade-xs': '4px',
        'blade-sm': '8px',
        'blade-md': '12px',
        'blade-lg': '16px',
        'blade-xl': '20px',
        'blade-2xl': '24px',
        'blade-3xl': '32px',
        'blade-4xl': '40px',
      },

      fontSize: {
        'blade-page': ['20px', { lineHeight: '1.2', fontWeight: '700' }],
        'blade-section': ['16px', { lineHeight: '1.2', fontWeight: '700' }],
        'blade-card-title': ['14px', { lineHeight: '1.2', fontWeight: '600' }],
        'blade-body': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'blade-body-sm': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        'blade-button': ['12px', { lineHeight: '1', fontWeight: '600', letterSpacing: '0.02em' }],
        'blade-section-label': ['10px', { lineHeight: '1', fontWeight: '600', letterSpacing: '0.1em' }],
        'blade-nav': ['12px', { lineHeight: '1', fontWeight: '400', letterSpacing: '0.02em' }],
        'blade-data': ['14px', { lineHeight: '1', fontWeight: '700' }],
        'blade-data-sm': ['11px', { lineHeight: '1', fontWeight: '400' }],
        'blade-timestamp': ['10px', { lineHeight: '1', fontWeight: '400' }],
        'blade-tag': ['10px', { lineHeight: '1', fontWeight: '500' }],
        'blade-logo': ['14px', { lineHeight: '1', fontWeight: '700', letterSpacing: '0.08em' }],
        'blade-logo-ver': ['9px', { lineHeight: '1', fontWeight: '400', letterSpacing: '0.12em' }],
      },

      keyframes: {
        'blade-emerge': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'blade-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },

      animation: {
        'blade-emerge': 'blade-emerge 0.4s ease both',
        'blade-spin': 'blade-spin 1s linear infinite',
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
};
