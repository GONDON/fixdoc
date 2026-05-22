'use strict';

// `fixdoc clear` — clean queue and/or drafts. Non-destructive to cases/INDEX.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const queue = require('./queue.js');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function listDraftFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

function confirm(question) {
  if (!process.stdin.isTTY) return Promise.resolve(true); // assume yes in non-interactive
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} [y/N] `, ans => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function clear(args, cfg) {
  const repoRoot = cfg._repoRoot;
  const draftDir = path.resolve(repoRoot, cfg.output.draft_dir);
  const queuePath = path.join(repoRoot, 'fixdoc', 'queue', 'pending.jsonl');

  let { queue: doQ, drafts: doD, all: doAll, 'reset-drafted': doReset, yes: skipPrompt } = args.flags;
  if (doAll) { doQ = true; doD = true; }
  if (!doQ && !doD && !doReset) {
    process.stderr.write(
      'fixdoc clear — choose what to remove:\n' +
      '  --queue           empty fixdoc/queue/pending.jsonl\n' +
      '  --drafts          delete fixdoc/knowledge/draft/ (including archived)\n' +
      '  --all             both of the above\n' +
      '  --reset-drafted   keep queue, delete draft files, flip drafted entries → pending\n' +
      '  -y / --yes        skip confirmation prompt\n' +
      '\nNeither cases/ nor INDEX.md is ever touched.\n'
    );
    return 1;
  }

  // Compute what will happen
  const plan = [];
  const queueEntries = queue.readAll(repoRoot);
  const draftFiles = listDraftFiles(draftDir);
  const archivedDir = path.join(draftDir, 'archived');
  const archivedFiles = listDraftFiles(archivedDir);

  if (doReset) {
    const draftedCount = queueEntries.filter(e => e.status === 'drafted').length;
    plan.push(`reset ${draftedCount} drafted queue entr${draftedCount === 1 ? 'y' : 'ies'} → pending`);
    plan.push(`delete ${draftFiles.length} draft file(s) (archived/ kept)`);
  } else {
    if (doQ) plan.push(`empty queue (${queueEntries.length} entries)`);
    if (doD) plan.push(`delete ${draftFiles.length + archivedFiles.length} draft file(s) under ${path.relative(repoRoot, draftDir)}/`);
  }

  process.stdout.write('Will:\n' + plan.map(p => `  - ${p}`).join('\n') + '\n');

  if (!skipPrompt) {
    const ok = await confirm('Proceed?');
    if (!ok) { process.stdout.write('Aborted.\n'); return 1; }
  }

  if (doReset) {
    rmrf(draftDir);
    fs.mkdirSync(draftDir, { recursive: true });
    let changed = 0;
    for (const e of queueEntries) {
      if (e.status === 'drafted') { e.status = 'pending'; delete e.draft; changed++; }
    }
    queue.writeAll(repoRoot, queueEntries);
    process.stdout.write(`Done. Reset ${changed} entr${changed === 1 ? 'y' : 'ies'}, draft dir cleared.\n`);
    return 0;
  }

  if (doQ) {
    if (fs.existsSync(queuePath)) fs.writeFileSync(queuePath, '');
  }
  if (doD) {
    rmrf(draftDir);
    fs.mkdirSync(draftDir, { recursive: true });
  }
  process.stdout.write('Done.\n');
  return 0;
}

module.exports = { clear };
