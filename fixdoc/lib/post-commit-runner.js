#!/usr/bin/env node
'use strict';

// post-commit hook entry. Reads HEAD commit, classifies, appends to queue.
// MUST fail-open: any error logs and exits 0 so commit is never blocked.

const path = require('path');
const { execSync } = require('child_process');

try {
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const message = execSync(`git log -1 --pretty=%B ${sha}`, { encoding: 'utf8' });

  const { loadConfig } = require(path.join(repoRoot, 'fixdoc', 'lib', 'config.js'));
  const { classify } = require(path.join(repoRoot, 'fixdoc', 'lib', 'trigger.js'));
  const queue = require(path.join(repoRoot, 'fixdoc', 'lib', 'queue.js'));

  const cfg = loadConfig(repoRoot);
  const info = classify(message, cfg.trigger);
  if (!info.match) process.exit(0);

  if (queue.hasSha(repoRoot, sha)) {
    process.stderr.write(`[fixdoc] commit ${sha.slice(0,7)} already queued; skipping\n`);
    process.exit(0);
  }

  queue.append(repoRoot, {
    sha,
    queued_at: new Date().toISOString(),
    status: 'pending',
    type: info.type,
    scope: info.scope,
    subject: info.subject,
    severity: info.severity,
  });
  process.stderr.write(`[fixdoc] queued ${sha.slice(0,7)} (${info.type || 'tag-triggered'}) — run \`fixdoc generate\`\n`);
} catch (e) {
  process.stderr.write(`[fixdoc] post-commit hook failed (non-blocking): ${e.message}\n`);
}
process.exit(0);
