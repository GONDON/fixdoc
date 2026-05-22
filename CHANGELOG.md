# Changelog

All notable changes to fixdoc are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versioning is
[SemVer](https://semver.org/).

## [Unreleased]

### Added
- `fixdoc init` 一键脚手架 — 在任意 git 项目里写入 `.githooks/post-commit`、
  `fixdoc/config.yaml`、`prompt.md`、`template.md`、`knowledge/`，并自动设置
  `core.hooksPath`。
- `install.sh` / `uninstall.sh` —— 单行安装到 `~/.fixdoc/`，shim 装到
  `~/.local/bin/fixdoc`。支持 `FIXDOC_HOME` / `FIXDOC_BIN_DIR` /
  `FIXDOC_SRC` / `FIXDOC_REPO_URL` / `FIXDOC_REF` 覆盖。
- `fixdoc _hook` 内部子命令 —— 取代项目内 `lib/post-commit-runner.js`。
- `scripts/release-smoke.sh` —— 发版前烟囱测试。
- `docs/USAGE.md`, `docs/DEPLOY.md`。

### Changed
- post-commit hook 不再 `require()` 项目内的 fixdoc 源码，改为调用 PATH 上的
  全局 `fixdoc _hook`。项目里只剩数据 + 模板 + 一个 bash hook，不再含 JS。
- draft 文件名 slug 不再含 `type(scope):` 前缀噪音；末尾追加 7 位 short SHA
  防止同主题 commit 互相覆盖（修复了 generate 的两个真实 bug）。
- `lib/collect.js`：`execSync` → `execFileSync`，避免把 SHA / commit body 拼
  进 shell 字符串（shell injection 加固）。

### Removed
- `fixdoc/lib/post-commit-runner.js`（被 `fixdoc _hook` 取代）。

### Migration
重跑 `install.sh` 升级；已 init 过的项目跑 `fixdoc init --force` 拉新 hook
（不会覆盖已编辑的 `config.yaml`）。

## [0.1.0] — 2026-05-21

### Added
- Phase 1 MVP 脚手架：CLI（`generate` / `confirm` / `status`）、
  `lib/{collect,config,prompt,queue,trigger,writer}.js`、
  `lib/llm/claude-cli.js`、`.githooks/post-commit`、prompt + template、
  `config.example.yaml`、`README.md`、`docs/PRD.md`。
