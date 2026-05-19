import React from 'react';

export default function DocumentTitle({ title, filename, clamp = true }) {
  if (!title) {
    return (
      <span className="font-body font-semibold text-blade-text">{filename}</span>
    );
  }
  return (
    <>
      <span className={`font-body font-semibold text-blade-text${clamp ? ' line-clamp-2' : ''}`}>
        {title}
      </span>
      <span className="font-mono text-blade-body-sm text-blade-text-muted block mt-0.5">
        {filename}
      </span>
    </>
  );
}
