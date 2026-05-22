'use strict';

// Decide whether a commit message should trigger fixdoc and extract metadata.

function classify(message, trigger) {
  const types = (trigger && trigger.types) || ['fixdoc', 'hotfix'];
  const tags = (trigger && trigger.tags) || ['autodoc'];
  const sev = (trigger && trigger.severity_tags) || {};

  const firstLine = (message.split(/\r?\n/)[0] || '').trim();
  const typesAlt = types.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const headerRe = new RegExp('^(' + typesAlt + ')(\\([^)]+\\))?!?:\\s*(.*)$');
  const m = firstLine.match(headerRe);

  let match = false;
  let type = null, scope = null, subject = '';
  if (m) {
    match = true;
    type = m[1];
    scope = m[2] ? m[2].slice(1, -1) : null;
    subject = m[3] || '';
  }

  const lower = message.toLowerCase();
  for (const tag of tags) {
    if (lower.includes('#' + tag.toLowerCase())) match = true;
  }

  let severity = 'standard';
  if (sev.urgent && lower.includes('#' + String(sev.urgent).toLowerCase())) severity = 'urgent';
  else if (sev.minor && lower.includes('#' + String(sev.minor).toLowerCase())) severity = 'minor';

  return { match, type, scope, subject, severity, firstLine };
}

module.exports = { classify };
