'use strict';

// Minimal YAML parser sufficient for fixdoc/config.yaml shape.
// Supports: nested keys (2-space indent), strings, numbers, booleans,
// inline arrays [a, b, c], and "#" line comments. No anchors / multi-doc.

function stripComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === inStr && line[i - 1] !== '\\') inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(x => parseScalar(x));
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYaml(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const line of rawLines) {
    const stripped = stripComment(line);
    if (stripped.trim() === '') continue;
    const indent = stripped.match(/^ */)[0].length;
    lines.push({ indent, body: stripped.slice(indent) });
  }

  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const { indent, body } of lines) {
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    const m = body.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const rest = m[2];
    if (rest === '') {
      const obj = {};
      parent[key] = obj;
      stack.push({ indent, value: obj });
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

const fs = require('fs');
const path = require('path');

function loadConfig(repoRoot) {
  const defaults = {
    llm: { provider: 'claude-cli', command: 'claude', args: ['-p'], timeout_ms: 120000 },
    output: {
      project_dir: 'fixdoc/knowledge/cases',
      draft_dir: 'fixdoc/knowledge/draft',
      index_file: 'fixdoc/knowledge/INDEX.md',
      obsidian_vault: '',
      obsidian_subdir: 'Knowledge/Postmortems',
      require_draft_review: true
    },
    diff: { max_lines: 500, context_lines: 3 },
    trigger: {
      types: ['fixdoc', 'hotfix'],
      tags: ['autodoc'],
      severity_tags: { urgent: 'autodoc-urgent', minor: 'autodoc-minor' }
    }
  };

  const userPath = path.join(repoRoot, 'fixdoc', 'config.yaml');
  let user = {};
  if (fs.existsSync(userPath)) {
    user = parseYaml(fs.readFileSync(userPath, 'utf8'));
  }
  return deepMerge(defaults, user);
}

function deepMerge(a, b) {
  if (b === null || b === undefined) return a;
  if (typeof a !== 'object' || Array.isArray(a) || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}

module.exports = { loadConfig, parseYaml };
