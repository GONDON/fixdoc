'use strict';

// `fixdoc init` — scaffold a target project so it can use fixdoc.
// Writes ONLY data + hook into the target. Does NOT copy fixdoc source code;
// the hook calls the globally-installed `fixdoc` binary.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Files/dirs to write into the target project.
function templateRoot() {
  // Resolve to fixdoc's own install location (this file lives at <install>/fixdoc/lib/init.js).
  return path.resolve(__dirname, '..', '..');
}

function ensureGitRepo(target) {
  if (!fs.existsSync(path.join(target, '.git'))) {
    throw new Error(`Not a git repository: ${target}\nRun \`git init\` first.`);
  }
}

function copyIfMissing(src, dst, force) {
  if (fs.existsSync(dst) && !force) return { written: false, reason: 'exists' };
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return { written: true };
}

function writeIfMissing(dst, content, force) {
  if (fs.existsSync(dst) && !force) return { written: false, reason: 'exists' };
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, content);
  return { written: true };
}

function appendGitignoreEntries(target) {
  const gi = path.join(target, '.gitignore');
  const required = [
    'fixdoc/queue/pending.jsonl',
    'fixdoc/config.yaml',
    'fixdoc/knowledge/draft/',
  ];
  let existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const toAdd = required.filter(e => !lines.includes(e));
  if (!toAdd.length) return { added: [] };
  if (existing && !existing.endsWith('\n')) existing += '\n';
  existing += '# fixdoc\n' + toAdd.join('\n') + '\n';
  fs.writeFileSync(gi, existing);
  return { added: toAdd };
}

function setHooksPath(target) {
  const current = (() => {
    try { return execSync('git config --get core.hooksPath', { cwd: target, encoding: 'utf8' }).trim(); }
    catch { return ''; }
  })();
  if (current === '.githooks') return { unchanged: true };
  if (current && current !== '.githooks') {
    return { conflict: current };
  }
  execSync('git config core.hooksPath .githooks', { cwd: target });
  return { set: true };
}

function init(args) {
  const target = process.cwd();
  const force = !!args.flags.force;

  ensureGitRepo(target);

  const src = templateRoot();
  const log = [];

  // 1) Hook
  const hookSrc = path.join(src, '.githooks', 'post-commit');
  const hookDst = path.join(target, '.githooks', 'post-commit');
  const hookReadmeSrc = path.join(src, '.githooks', 'README.md');
  const hookReadmeDst = path.join(target, '.githooks', 'README.md');
  const r1 = copyIfMissing(hookSrc, hookDst, force);
  if (r1.written) { fs.chmodSync(hookDst, 0o755); log.push(`+ .githooks/post-commit`); }
  else log.push(`= .githooks/post-commit (kept; --force to overwrite)`);
  if (copyIfMissing(hookReadmeSrc, hookReadmeDst, force).written) log.push(`+ .githooks/README.md`);

  // 2) Config + prompt + template
  for (const rel of ['fixdoc/config.example.yaml', 'fixdoc/prompt.md', 'fixdoc/template.md']) {
    const r = copyIfMissing(path.join(src, rel), path.join(target, rel), force);
    if (r.written) log.push(`+ ${rel}`);
    else log.push(`= ${rel} (kept)`);
  }

  // 3) Local config — only if missing (never overwrite user edits even with --force)
  const cfgDst = path.join(target, 'fixdoc', 'config.yaml');
  if (!fs.existsSync(cfgDst)) {
    fs.copyFileSync(path.join(src, 'fixdoc', 'config.example.yaml'), cfgDst);
    log.push(`+ fixdoc/config.yaml (from example)`);
  } else {
    log.push(`= fixdoc/config.yaml (kept)`);
  }

  // 4) Knowledge dir + INDEX seed
  const indexDst = path.join(target, 'fixdoc', 'knowledge', 'INDEX.md');
  if (!fs.existsSync(indexDst)) {
    fs.mkdirSync(path.dirname(indexDst), { recursive: true });
    fs.writeFileSync(indexDst, '# Fixdoc 案例索引\n\n| 日期 | 主题 | Scope | Commit | 文件 |\n|------|------|-------|--------|------|\n');
    log.push(`+ fixdoc/knowledge/INDEX.md`);
  }
  for (const sub of ['cases', 'draft']) {
    const dir = path.join(target, 'fixdoc', 'knowledge', sub);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    if (sub === 'cases' && !fs.existsSync(keep)) {
      fs.writeFileSync(keep, '');
      log.push(`+ fixdoc/knowledge/cases/.gitkeep`);
    }
  }
  fs.mkdirSync(path.join(target, 'fixdoc', 'queue'), { recursive: true });

  // 5) gitignore
  const gi = appendGitignoreEntries(target);
  if (gi.added.length) log.push(`+ .gitignore: ${gi.added.join(', ')}`);

  // 6) hooksPath
  const hp = setHooksPath(target);
  if (hp.set) log.push(`+ git config core.hooksPath .githooks`);
  else if (hp.conflict) log.push(`! core.hooksPath is already set to "${hp.conflict}" — leaving it. You'll need to merge .githooks/post-commit into your existing hooks dir manually.`);
  else log.push(`= core.hooksPath already .githooks`);

  process.stdout.write(log.join('\n') + '\n\n');
  process.stdout.write([
    'Done. Next:',
    '  1. Edit fixdoc/config.yaml — set output.obsidian_vault if you use Obsidian.',
    '  2. Make a `fixdoc(scope): ...` commit and run `fixdoc generate`.',
    '  3. Commit the new files: git add fixdoc .githooks .gitignore && git commit -m "chore: add fixdoc"',
    '',
  ].join('\n'));
  return 0;
}

module.exports = { init };
