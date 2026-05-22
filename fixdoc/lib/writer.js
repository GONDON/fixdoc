'use strict';

// File writers: draft, cases, Obsidian, INDEX.md.

const fs = require('fs');
const path = require('path');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[`'".,;:!?()[\]{}<>]/g, '')
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function dateOnly(iso) {
  // ISO timestamp -> YYYY-MM-DD
  return (iso || new Date().toISOString()).slice(0, 10);
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function buildSlug(ctx, info) {
  const base = info.scope ? `${info.scope}-${ctx.subject}` : ctx.subject;
  return slugify(base);
}

function draftFilename(ctx, info) {
  return `${dateOnly(ctx.date)}-${buildSlug(ctx, info)}.md`;
}

function writeDraft(repoRoot, cfg, ctx, info, content) {
  const dir = path.resolve(repoRoot, cfg.output.draft_dir);
  ensureDir(dir);
  const filename = draftFilename(ctx, info);
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, content);
  return { filename, fullPath };
}

function readDraft(repoRoot, cfg, filename) {
  const dir = path.resolve(repoRoot, cfg.output.draft_dir);
  const full = path.join(dir, filename);
  if (!fs.existsSync(full)) throw new Error(`Draft not found: ${full}`);
  return { fullPath: full, content: fs.readFileSync(full, 'utf8') };
}

function listDrafts(repoRoot, cfg) {
  const dir = path.resolve(repoRoot, cfg.output.draft_dir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function archiveDraft(repoRoot, cfg, filename) {
  const dir = path.resolve(repoRoot, cfg.output.draft_dir);
  const archived = path.join(dir, 'archived');
  ensureDir(archived);
  const src = path.join(dir, filename);
  const dst = path.join(archived, filename);
  fs.renameSync(src, dst);
  return dst;
}

function writeCase(repoRoot, cfg, filename, content) {
  const dir = path.resolve(repoRoot, cfg.output.project_dir);
  ensureDir(dir);
  const full = path.join(dir, filename);
  fs.writeFileSync(full, content);
  return full;
}

function caseExists(repoRoot, cfg, filename) {
  return fs.existsSync(path.join(path.resolve(repoRoot, cfg.output.project_dir), filename));
}

function writeObsidian(cfg, filename, content) {
  const vault = cfg.output.obsidian_vault;
  if (!vault) return { skipped: true, reason: 'obsidian_vault not configured' };
  if (!fs.existsSync(vault)) {
    throw new Error(`obsidian_vault path does not exist: ${vault}`);
  }
  const dir = path.join(vault, cfg.output.obsidian_subdir || '');
  ensureDir(dir);
  const full = path.join(dir, filename);
  // Append a Related Links section if not present.
  let out = content;
  if (!/##\s*相关链接|##\s*Related/.test(out)) {
    out += '\n\n## 相关链接\n\n- [[fixdoc-cases-index]]\n';
  }
  fs.writeFileSync(full, out);
  return { skipped: false, fullPath: full };
}

// INDEX.md row update
function updateIndex(repoRoot, cfg, row) {
  const indexPath = path.resolve(repoRoot, cfg.output.index_file);
  ensureDir(path.dirname(indexPath));
  const header = `# Fixdoc 案例索引\n\n| 日期 | 主题 | Scope | Commit | 文件 |\n|------|------|-------|--------|------|\n`;
  let body = '';
  if (fs.existsSync(indexPath)) {
    const existing = fs.readFileSync(indexPath, 'utf8');
    const tableStart = existing.indexOf('|------');
    if (tableStart === -1) body = '';
    else {
      const rest = existing.slice(tableStart);
      const newlineIdx = rest.indexOf('\n');
      body = rest.slice(newlineIdx + 1);
    }
  }
  const line = `| ${row.date} | ${row.title} | ${row.scope || '-'} | ${row.shortSha} | [${row.relPath}](${row.relPath}) |\n`;
  // Avoid duplicate row for same shortSha
  if (!body.includes(`| ${row.shortSha} |`)) {
    body = line + body;
  }
  fs.writeFileSync(indexPath, header + body);
  return indexPath;
}

module.exports = {
  slugify, dateOnly, draftFilename,
  writeDraft, readDraft, listDrafts, archiveDraft,
  writeCase, caseExists, writeObsidian, updateIndex,
};
