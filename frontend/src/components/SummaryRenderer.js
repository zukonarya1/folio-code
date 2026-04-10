import React from 'react';

export function normalizeSummary(summary) {
  if (!summary) return null;
  if (summary.sections !== undefined) return summary;

  const sections = [];

  if (summary.learning_objectives && summary.learning_objectives.length > 0) {
    sections.push({ label: 'Learning Objectives', items: summary.learning_objectives });
  }

  if (summary.content) {
    if (Array.isArray(summary.content.sections)) {
      summary.content.sections.forEach((s) => {
        const sec = { label: s.heading || 'Section' };
        if (s.content) sec.content = s.content;
        if (s.key_points && s.key_points.length > 0) sec.items = s.key_points;
        sections.push(sec);
      });
    }
  }

  if (summary.key_takeaways && summary.key_takeaways.length > 0) {
    sections.push({ label: 'Key Takeaways', items: summary.key_takeaways });
  }

  return {
    title: summary.title,
    introduction: summary.content?.introduction || '',
    sections,
    glossary: summary.glossary || [],
    sources_used: summary.sources_used || 0,
  };
}

export default function SummaryRenderer({ summary }) {
  const data = normalizeSummary(summary);
  if (!data) return null;

  return (
    <div className="summary-content">
      {data.title && (
        <h2 className="animate-blade-emerge">{data.title}</h2>
      )}

      <div className="w-24 h-px bg-blade-border opacity-50 my-6" />

      {data.introduction && (
        <div className="summary-intro">
          <p>{data.introduction}</p>
        </div>
      )}

      {data.sections && data.sections.map((section, i) => (
        <div key={i} className="summary-section">
          <h4>{section.label}</h4>
          {section.content && <p>{section.content}</p>}
          {section.items && section.items.length > 0 && (
            <ul className="summary-items">
              {section.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {data.glossary && data.glossary.length > 0 && (
        <div className="summary-section">
          <h4>Glossary</h4>
          <dl className="summary-glossary">
            {data.glossary.map((item, i) => (
              <div key={i} className="summary-glossary-entry">
                {item.term && <dt>{item.term}</dt>}
                {item.definition && <dd>{item.definition}</dd>}
              </div>
            ))}
          </dl>
        </div>
      )}

      {typeof data.sources_used === 'number' && data.sources_used > 0 && (
        <p className="summary-footer">
          Based on {data.sources_used} source passages
        </p>
      )}
    </div>
  );
}
