'use strict';

// Assemble the prompt sent to the LLM from prompt.md + template.md + collected context.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function assemble(ctx, info, cfg) {
  const root = cfg._repoRoot;
  const systemPrompt = read(path.join(root, 'fixdoc', 'prompt.md'));
  const template = read(path.join(root, 'fixdoc', 'template.md'));

  const sevNote = {
    urgent: 'Severity: URGENT — produce the FULL document including rollback, blast radius, prevention.',
    minor: 'Severity: MINOR — produce a CONCISE document (summary + root cause + fix; other sections may be brief or omitted).',
    standard: 'Severity: STANDARD — produce all sections in the template at normal depth.'
  }[info.severity] || '';

  return [
    systemPrompt.trim(),
    '',
    '---',
    '',
    '## Output Template',
    'Reply with ONLY a Markdown document that follows this exact structure (frontmatter + headings). Fill placeholders with concrete content. Do not include backticks fencing the whole document.',
    '',
    template.trim(),
    '',
    '---',
    '',
    '## Commit Context',
    sevNote,
    '',
    `- SHA: ${ctx.sha}`,
    `- Date: ${ctx.date}`,
    `- Author: ${ctx.author}`,
    `- Type: ${info.type || '(tag-triggered)'}`,
    `- Scope: ${info.scope || '(none)'}`,
    `- Subject: ${ctx.subject}`,
    '',
    '### Commit body',
    ctx.body || '(empty)',
    '',
    '### Files changed',
    ctx.files.map(f => `- ${f}`).join('\n') || '(none)',
    '',
    '### Stat',
    '```',
    ctx.stat,
    '```',
    '',
    '### Diff',
    '```diff',
    ctx.diff,
    '```',
    ctx.diffTruncated ? '\n(diff was truncated by diff.max_lines)' : '',
    '',
    '## Required output rules',
    '1. Replace template placeholders ({title}, {commit-sha}, etc.) with real values from the context above.',
    '2. Use the commit SHA for the `id` frontmatter field, the commit date for `date`.',
    '3. Redact any tokens, passwords, API keys, or PII visible in the diff (replace with `[REDACTED]`).',
    '4. Output Markdown only — no preamble like "Here is the document:".',
  ].join('\n');
}

module.exports = { assemble };
