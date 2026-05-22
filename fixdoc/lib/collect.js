'use strict';

// Collect commit context for the LLM: subject, body, stat, name-only, diff.

const { execSync } = require('child_process');

function git(args, repoRoot) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

function collect(sha, cfg) {
  const root = cfg._repoRoot || process.cwd();
  const message = git(`log -1 --pretty=%B ${sha}`, root);
  const lines = message.split(/\r?\n/);
  const subject = lines[0] || '';
  const body = lines.slice(1).join('\n').trim();
  const author = git(`log -1 --pretty=%an <%ae> ${sha}`, root).trim();
  const date = git(`log -1 --pretty=%cI ${sha}`, root).trim();
  const stat = git(`show --stat --format= ${sha}`, root).trim();
  const nameOnly = git(`show --name-only --format= ${sha}`, root).trim().split(/\r?\n/).filter(Boolean);

  const ctx = (cfg.diff && cfg.diff.context_lines) || 3;
  const maxLines = (cfg.diff && cfg.diff.max_lines) || 500;
  let diff = git(`show -U${ctx} --format= ${sha}`, root);
  let truncated = false;
  const diffLines = diff.split(/\r?\n/);
  if (diffLines.length > maxLines) {
    diff = diffLines.slice(0, maxLines).join('\n') + `\n... [truncated; ${diffLines.length - maxLines} more lines omitted by diff.max_lines=${maxLines}]`;
    truncated = true;
  }

  return { sha, shortSha: sha.slice(0, 7), subject, body, author, date, stat, files: nameOnly, diff, diffTruncated: truncated };
}

module.exports = { collect };
