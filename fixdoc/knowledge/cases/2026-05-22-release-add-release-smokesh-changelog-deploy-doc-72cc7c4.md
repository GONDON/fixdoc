---
id: 72cc7c4e1ed2afc2e2251fd9b7f8d121f59e7cfb
date: 2026-05-22
type: bugfix
severity: unknown
scope: release
affected: [CHANGELOG.md, docs/DEPLOY.md, scripts/release-smoke.sh]
tags: [fixdoc]
status: resolved
---

# fixdoc(release): add release-smoke.sh, CHANGELOG, deploy doc

## 问题现象

发版流程存在三个缺口：

- 没有自动化的发版前烟囱测试，每次发版需要手动验证 install → init → commit → 队列写入的链路。
- 仓库根缺少 `CHANGELOG.md`，用户在升级 / 回滚 fixdoc 时无法查看版本间变更与迁移说明。
- 缺少面向维护者的发布 / 部署文档，新维护者无法独立完成一次发版。

## 根因分析

Phase 1 MVP（0.1.0）只交付了运行时本体（CLI / hook / install.sh），未沉淀"如何把它发出去"这一侧的工程资产。具体地：

- 烟囱链路只存在于维护者的口头/手工流程里，缺一段可重放的脚本固化 install + init + 触发规则的关键断言。
- 版本号在 `package.json` 中维护，但没有 changelog 载体记录 Added / Changed / Removed / Migration，破坏性变更没有公开通告位。
- 发布流程、内网托管、升级回滚、安全清单、已知风险等知识散落在维护者脑内，缺单一入口。

## 解决方案

新增三个发布侧资产，全部为新文件，不改动运行时代码：

- `scripts/release-smoke.sh`（51 行，`chmod +x`）：用 `FIXDOC_SRC=$REPO_ROOT` 把当前工作树装到 mktemp sandbox（`FIXDOC_HOME` / `FIXDOC_BIN_DIR` 隔离），在沙箱里 `git init` 新项目、跑 `fixdoc init`，逐项断言：
  - `.githooks/post-commit` 可执行、`fixdoc/config.yaml`、`fixdoc/knowledge/INDEX.md` 存在；
  - `git config core.hooksPath == .githooks`；
  - `fixdoc(smoke): ...` commit 入队（`fixdoc/queue/pending.jsonl` 非空）且 `fixdoc status` 包含 pending；
  - 反向断言：`fix: unrelated` commit **不**入队（`wc -l` 仍为 1）。
  通过则输出 `OK: release smoke passed`，任一断言失败即非零退出。
- `CHANGELOG.md`（41 行）：Keep-a-Changelog 格式，首两个条目 `[Unreleased]`（记录 `fixdoc init`、`install.sh` / `uninstall.sh`、`fixdoc _hook`、slug 修复、`execFileSync` 加固、`post-commit-runner.js` 删除及迁移指引）和 `[0.1.0] — 2026-05-21`。
- `docs/DEPLOY.md`（330 行）：维护者文档，12 节，覆盖角色与发布渠道、仓库结构、SemVer + 版本升级、发版流程（含预检 / tag / 用户拿到新版）、内网自托管、升级回滚、破坏性变更管理、安全清单（含 `sk-...` grep、`execFileSync` 强制、不 sudo、prompt 脱敏要求、草稿 gitignore）、已知风险、路线图、完整发版会话示例、FAQ。

## 影响面评估

### 用户影响

无运行时影响。终端用户的 `install.sh` / `fixdoc` CLI 行为不变。维护者获得可重放的烟囱脚本和发布手册。

### 数据影响

无。未触碰 `pending.jsonl` / `INDEX.md` / 草稿目录的结构。

### 性能影响

无。新增脚本只在维护者手动执行时运行；沙箱使用 `mktemp -d` 并在 `trap` 中清理。

### 兼容性

无破坏性变更。CHANGELOG 在 `[Unreleased]` 段以文档形式记录了既有的迁移要点（`install.sh` 重跑、`fixdoc init --force`），但本提交本身不引入新的迁移要求。

## 变更文件清单

- `CHANGELOG.md`（新增，41 行）
- `docs/DEPLOY.md`（新增，330 行）
- `scripts/release-smoke.sh`（新增，51 行，可执行）

## 验证方式

- 在仓库根执行 `bash scripts/release-smoke.sh`，期望末行输出 `OK: release smoke passed`，退出码 0。
- 脚本内置正反两路断言：fixdoc(smoke) commit 必须入队；后续 `fix: unrelated` commit 必须不入队（`pending.jsonl` 行数保持为 1）。
- `CHANGELOG.md` / `docs/DEPLOY.md` 为纯文档，未引入可执行逻辑，无需额外验证。

## 回滚方案

三文件皆为新增、相互独立、无运行时引用：

```bash
git revert 72cc7c4e1ed2afc2e2251fd9b7f8d121f59e7cfb
```

或单文件移除：`git rm scripts/release-smoke.sh CHANGELOG.md docs/DEPLOY.md && git commit`。回滚后 fixdoc 运行时与既有发版流程不受影响，仅回到"手工烟囱 + 无 CHANGELOG"的旧状态。

## 预防与后续

- 把 `bash scripts/release-smoke.sh` 写入发版预检清单（`docs/DEPLOY.md` §4.1 已声明），后续每次打 tag 前强制跑。
- 中期接入 GitHub Actions：`tag → smoke → 标 latest`（`docs/DEPLOY.md` §10 路线图）。
- 短期补 `git` 版本预检（≥ 2.9，`core.hooksPath` 支持），`docs/DEPLOY.md` §9 已列为已知风险。
- 每次发版前同步更新 `CHANGELOG.md` 的 `[Unreleased]` 段，破坏性变更必须显式标注「需 `fixdoc init --force`」。
- 安全清单（§8）落地为可脚本化的 grep —— 后续可在 smoke 脚本中追加 `sk-[A-Za-z0-9_-]{30,}` 扫描断言。