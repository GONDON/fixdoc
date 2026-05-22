'use strict';

// JSONL queue persistence: fixdoc/queue/pending.jsonl
// Each line: { sha, queued_at, status, type?, scope?, subject?, severity?, draft? }

const fs = require('fs');
const path = require('path');

function queuePath(repoRoot) {
  return path.join(repoRoot, 'fixdoc', 'queue', 'pending.jsonl');
}

function readAll(repoRoot) {
  const p = queuePath(repoRoot);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

function writeAll(repoRoot, entries) {
  const p = queuePath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));
}

function append(repoRoot, entry) {
  const p = queuePath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(entry) + '\n');
}

function hasSha(repoRoot, sha) {
  return readAll(repoRoot).some(e => e.sha === sha);
}

function updateBySha(repoRoot, sha, patch) {
  const all = readAll(repoRoot);
  let found = false;
  for (const e of all) {
    if (e.sha === sha) { Object.assign(e, patch); found = true; }
  }
  if (found) writeAll(repoRoot, all);
  return found;
}

function firstPending(repoRoot) {
  return readAll(repoRoot).find(e => e.status === 'pending') || null;
}

module.exports = { queuePath, readAll, writeAll, append, hasSha, updateBySha, firstPending };
