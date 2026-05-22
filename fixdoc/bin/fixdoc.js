#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const { loadConfig } = require('../lib/config.js');
const { classify } = require('../lib/trigger.js');
const queue = require('../lib/queue.js');
const { collect } = require('../lib/collect.js');
const { assemble } = require('../lib/prompt.js');
const claudeCli = require('../lib/llm/claude-cli.js');
const writer = require('../lib/writer.js');
const { execSync } = require('child_process');

function findRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out.flags[k] = next; i++; }
      else out.flags[k] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printUsage() {
  process.stdout.write(`fixdoc — generate postmortem docs from fixdoc: commits

Usage:
  fixdoc init [--force]                   Scaffold fixdoc/ + .githooks/ in current project
  fixdoc generate [--sha <sha>] [--all]   Generate draft(s) from queue
  fixdoc confirm  [<draft.md>|--latest]   Archive a reviewed draft to cases (+ Obsidian)
  fixdoc status                           Show queue and draft state
  fixdoc help                             Show this message

Config: fixdoc/config.yaml (copy from fixdoc/config.example.yaml)
After init, hooks are activated automatically via core.hooksPath = .githooks
`);
}

// ---------- generate ----------

function selectTargets(cfg, args) {
  const repoRoot = cfg._repoRoot;
  if (args.flags.sha) {
    const sha = String(args.flags.sha);
    const full = execSync(`git rev-parse ${sha}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
    const existing = queue.readAll(repoRoot).find(e => e.sha === full);
    if (existing) return [existing];
    const msg = execSync(`git log -1 --pretty=%B ${full}`, { cwd: repoRoot, encoding: 'utf8' });
    const info = classify(msg, cfg.trigger);
    return [{
      sha: full,
      queued_at: new Date().toISOString(),
      status: 'pending',
      type: info.type,
      scope: info.scope,
      subject: info.subject,
      severity: info.severity,
      _ephemeral: true,
    }];
  }
  if (args.flags.all) {
    return queue.readAll(repoRoot).filter(e => e.status === 'pending');
  }
  const first = queue.firstPending(repoRoot);
  return first ? [first] : [];
}

function cmdGenerate(args) {
  const cfg = loadConfig(findRepoRoot());
  cfg._repoRoot = cfg._repoRoot || findRepoRoot();

  const targets = selectTargets(cfg, args);
  if (!targets.length) {
    process.stdout.write('No pending entries in queue. Make a `fixdoc:` commit first.\n');
    return 0;
  }

  let okCount = 0, failCount = 0;
  for (const entry of targets) {
    const ctx = collect(entry.sha, cfg);
    const info = {
      type: entry.type,
      scope: entry.scope,
      subject: entry.subject || ctx.subject,
      severity: entry.severity || 'standard',
    };
    const prompt = assemble(ctx, info, cfg);

    process.stdout.write(`[fixdoc] generating for ${ctx.shortSha} (${info.type || 'tag'}/${info.severity})...\n`);
    let output;
    try {
      output = claudeCli.generate(prompt, cfg);
    } catch (e) {
      process.stderr.write(`[fixdoc] generate failed for ${ctx.shortSha}: ${e.message}\n`);
      failCount++;
      continue;
    }
    if (!output || !output.trim()) {
      process.stderr.write(`[fixdoc] Claude returned empty output for ${ctx.shortSha}; keeping pending.\n`);
      failCount++;
      continue;
    }

    const { filename, fullPath } = writer.writeDraft(cfg._repoRoot, cfg, ctx, info, output);
    if (!entry._ephemeral) {
      queue.updateBySha(cfg._repoRoot, entry.sha, { status: 'drafted', draft: filename });
    }
    process.stdout.write(`[fixdoc] draft → ${path.relative(cfg._repoRoot, fullPath)}\n`);
    process.stdout.write(`         review, then run: fixdoc confirm ${filename}\n`);
    okCount++;
  }
  return failCount && !okCount ? 1 : 0;
}

// ---------- confirm ----------

function extractTitle(content) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

function extractFrontmatter(content) {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const fm = content.slice(3, end);
  const out = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function cmdConfirm(args) {
  const repoRoot = findRepoRoot();
  const cfg = loadConfig(repoRoot);
  cfg._repoRoot = repoRoot;

  let filename;
  if (args.flags.latest) {
    const drafts = writer.listDrafts(repoRoot, cfg);
    if (!drafts.length) {
      process.stderr.write('No drafts available to confirm.\n');
      return 1;
    }
    filename = drafts[0].name;
  } else if (args._[0]) {
    filename = path.basename(args._[0]);
  } else {
    process.stderr.write('Usage: fixdoc confirm <draft.md> | --latest\n');
    return 1;
  }

  if (writer.caseExists(repoRoot, cfg, filename)) {
    process.stderr.write(`[fixdoc] case file already exists: ${filename} — refusing to overwrite.\n`);
    return 1;
  }

  const { fullPath, content } = writer.readDraft(repoRoot, cfg, filename);
  const fm = extractFrontmatter(content);
  const title = extractTitle(content) || filename.replace(/\.md$/, '');

  const caseFull = writer.writeCase(repoRoot, cfg, filename, content);
  process.stdout.write(`[fixdoc] case → ${path.relative(repoRoot, caseFull)}\n`);

  let obsidianMsg = '';
  try {
    const r = writer.writeObsidian(cfg, filename, content);
    if (r.skipped) obsidianMsg = `[fixdoc] obsidian skipped: ${r.reason}`;
    else obsidianMsg = `[fixdoc] obsidian → ${r.fullPath}`;
  } catch (e) {
    process.stderr.write(`[fixdoc] obsidian write failed: ${e.message}\n`);
    return 1;
  }
  if (obsidianMsg) process.stdout.write(obsidianMsg + '\n');

  const relPath = path.relative(
    path.dirname(path.resolve(repoRoot, cfg.output.index_file)),
    caseFull
  );
  writer.updateIndex(repoRoot, cfg, {
    date: fm.date ? String(fm.date).slice(0, 10) : writer.dateOnly(new Date().toISOString()),
    title,
    scope: fm.scope || '',
    shortSha: (fm.id || '').slice(0, 7) || filename.slice(0, 10),
    relPath,
  });
  process.stdout.write(`[fixdoc] index updated: ${cfg.output.index_file}\n`);

  if (fm.id) {
    queue.updateBySha(repoRoot, fm.id, { status: 'completed', case: filename });
  } else {
    // fall back: mark any drafted entry referencing this filename
    const all = queue.readAll(repoRoot);
    for (const e of all) if (e.draft === filename) e.status = 'completed';
    queue.writeAll(repoRoot, all);
  }

  writer.archiveDraft(repoRoot, cfg, filename);
  process.stdout.write(`[fixdoc] draft archived. Next: git add ${path.dirname(path.relative(repoRoot, caseFull))} && git commit -m "docs: fixdoc case ${title}"\n`);
  return 0;
}

// ---------- status ----------

function cmdStatus() {
  const repoRoot = findRepoRoot();
  const cfg = loadConfig(repoRoot);
  cfg._repoRoot = repoRoot;

  const entries = queue.readAll(repoRoot);
  const counts = { pending: 0, drafted: 0, completed: 0, other: 0 };
  for (const e of entries) counts[e.status] != null ? counts[e.status]++ : counts.other++;

  process.stdout.write(`Queue (${counts.pending} pending, ${counts.drafted} drafted, ${counts.completed} completed):\n`);
  if (!entries.length) {
    process.stdout.write('  (empty — make a `fixdoc(scope): ...` commit to enqueue)\n');
  } else {
    for (const e of entries) {
      const short = e.sha.slice(0, 7);
      const header = e.type ? `${e.type}${e.scope ? `(${e.scope})` : ''}: ${e.subject || ''}` : `(tag) ${e.subject || ''}`;
      const trail = e.status === 'drafted' && e.draft ? ` → draft/${e.draft}` : '';
      process.stdout.write(`  ${short}  ${header.padEnd(40)} ${e.status}${trail}\n`);
    }
  }

  const drafts = writer.listDrafts(repoRoot, cfg);
  process.stdout.write(`\nDrafts awaiting review (${drafts.length}):\n`);
  if (!drafts.length) process.stdout.write('  (none)\n');
  for (const d of drafts) process.stdout.write(`  ${d.name}\n`);

  if (!cfg.output.obsidian_vault) {
    process.stdout.write('\nNote: obsidian_vault is empty — confirm will skip Obsidian write.\n');
  } else if (!fs.existsSync(cfg.output.obsidian_vault)) {
    process.stdout.write(`\nWarning: obsidian_vault path missing: ${cfg.output.obsidian_vault}\n`);
  }
  return 0;
}

// ---------- main ----------

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printUsage();
    return 0;
  }
  try {
    if (cmd === 'init') return require('../lib/init.js').init(args);
    if (cmd === '_hook') return require('../lib/hook.js').runHook();
    if (cmd === 'generate') return cmdGenerate(args);
    if (cmd === 'confirm') return cmdConfirm(args);
    if (cmd === 'status') return cmdStatus();
    process.stderr.write(`Unknown command: ${cmd}\n\n`);
    printUsage();
    return 1;
  } catch (e) {
    process.stderr.write(`[fixdoc] error: ${e.message}\n`);
    return 1;
  }
}

process.exit(main());
