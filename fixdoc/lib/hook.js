'use strict';

// Hook entrypoint: invoked by .githooks/post-commit as `fixdoc _hook`.
// Reads HEAD commit, classifies, appends to queue. Must fail-open.

const { execSync } = require('child_process');
const { loadConfig } = require('./config.js');
const { classify } = require('./trigger.js');
const queue = require('./queue.js');

function runHook() {
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const sha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    const message = execSync(`git log -1 --pretty=%B ${sha}`, { cwd: repoRoot, encoding: 'utf8' });

    const cfg = loadConfig(repoRoot);
    const info = classify(message, cfg.trigger);
    if (!info.match) return 0;

    if (queue.hasSha(repoRoot, sha)) {
      process.stderr.write(`[fixdoc] commit ${sha.slice(0,7)} already queued; skipping\n`);
      return 0;
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
  return 0;
}

module.exports = { runHook };
