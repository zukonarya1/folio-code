import React from 'react';

export default function UsageWidget({ usage, isLoading }) {
  if (isLoading) {
    return (
      <div className="usage-widget" style={{ opacity: 0.5 }}>
        <div className="usage-widget__bar">
          <div className="usage-widget__fill" style={{ width: '0%' }} />
        </div>
        <p className="usage-widget__label">Loading usage…</p>
      </div>
    );
  }

  if (!usage) return null;

  if (usage.role === 'admin') {
    return (
      <div className="usage-widget">
        <p className="usage-widget__label">Unlimited access</p>
      </div>
    );
  }

  const total = usage.total_tokens || 0;
  const limit = usage.monthly_limit || 3_000_000;
  const percent = Math.min((total / limit) * 100, 100);
  const isNearLimit = percent >= 80;

  const fmt = (n) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${Math.round(n / 1_000)}K`
      : `${n}`;

  return (
    <div className="usage-widget">
      <div className="usage-widget__header">
        <span className="usage-widget__title">Monthly tokens</span>
        <span className="usage-widget__reset">resets {usage.reset_date}</span>
      </div>
      <div className="usage-widget__bar" aria-label={`${Math.round(percent)}% of monthly token limit used`}>
        <div
          className="usage-widget__fill"
          style={{
            width: `${percent}%`,
            backgroundColor: isNearLimit ? 'var(--blade-accent)' : 'var(--blade-success)',
          }}
        />
      </div>
      <p className="usage-widget__label">
        {fmt(total)} / {fmt(limit)} tokens used
      </p>
    </div>
  );
}
