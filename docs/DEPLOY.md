# Fixdoc 部署与发布文档

面向 fixdoc 维护者。本文说明如何把 fixdoc 从开发分支推到团队/公开用户可装的状态。
用户侧的安装与使用在 `docs/USAGE.md`。

---

## 1. 角色与目标

| 角色 | 关心 |
|------|------|
| **维护者**（你） | 改 fixdoc 源码、发版、回滚 |
| **团队管理员** | 在内网部署一份 fixdoc 源，团队成员都从这里 install |
| **终端用户** | `curl ... | bash` 一行装好，`fixdoc init` 接入项目 |

发布渠道（按推荐度）：

1. **公开 Git 仓库 + install.sh**（GitHub / GitLab / 自建）—— 用户 `curl install.sh | bash`，脚本 `git clone --depth=1` 拉源码到 `~/.fixdoc/`。
2. **内网 Git 镜像** —— 同上，但 `FIXDOC_REPO_URL` 指向内网。
3. **本地 / U 盘 / 共享盘分发** —— 给一份 zip，用户 `FIXDOC_SRC=/path bash install.sh`。
4. **npm 包** —— 不在 Phase 1 范围（团队跨语言场景下不通用）。

---

## 2. 仓库结构（发布相关）

```
fixdoc/
├── install.sh             ← 用户 curl 它
├── uninstall.sh
├── package.json           版本号在这里
├── fixdoc/                运行时源码（Node）
│   ├── bin/fixdoc.js
│   ├── lib/
│   ├── prompt.md
│   ├── template.md
│   └── config.example.yaml
├── .githooks/post-commit  fixdoc init 会复制到目标项目
└── docs/
    ├── PRD.md
    ├── USAGE.md           面向用户
    └── DEPLOY.md          ← 本文
```

`install.sh` 在 `FIXDOC_SRC` 模式下复制 `fixdoc/`、`.githooks/`、`package.json`、`README.md`；`git clone` 模式下整库浅克隆。两种模式产生同样的 `~/.fixdoc/` 目录布局。

---

## 3. 版本管理

### 3.1 语义化版本

`package.json` 的 `version` 是唯一权威版本号。

| 变更类型 | 版本号 | 例 |
|---------|-------|----|
| Bug 修复，行为不变 | patch | 0.1.0 → 0.1.1 |
| 加新 CLI 子命令 / 新配置字段（向后兼容） | minor | 0.1.1 → 0.2.0 |
| 改默认值 / 改触发规则 / 改文件布局 | major（Phase 1 期间允许 minor） | 0.x → 0.x+1 |

### 3.2 升 version

```bash
# 编辑 package.json: "version": "0.2.0"
git add package.json
git commit -m "chore(release): v0.2.0"
git tag v0.2.0
git push && git push --tags
```

不强制走 `npm version`，但用也行（不会触发 publish，仅打 tag）：

```bash
npm version minor --no-git-tag-version
```

### 3.3 维护 CHANGELOG

每次发版前，在仓库根写 `CHANGELOG.md`（暂未创建，建议在第一次 minor 时新建）：

```markdown
## v0.2.0 — 2026-06-XX
### Added
- `fixdoc init` 一键脚手架
- install.sh 支持 FIXDOC_SRC 本地源码安装

### Changed
- post-commit hook 改为调用全局 fixdoc，不再依赖项目内 lib

### Fixed
- draft slug 不再含 commit type 噪音；文件名追加 short SHA 防止冲突
```

---

## 4. 发版流程（公开 Git 渠道）

### 4.1 预检（每次发版必跑）

```bash
# 1. 工作树干净
git status

# 2. 在干净 sandbox 里跑 install + init + 一次 commit，确认 hook 入队
bash scripts/release-smoke.sh   # 见下方 §4.4

# 3. 检查 install.sh 默认 REPO_URL 已指向真实仓库
grep '^REPO_URL' install.sh
```

### 4.2 打 tag 推送

```bash
git tag v0.2.0
git push origin main --tags
```

GitHub 上可建一个 Release，把对应 tag 标为 latest，附 CHANGELOG 摘要。

### 4.3 用户拿到新版

`install.sh` 默认 `FIXDOC_REF=main`，所以已装用户**重跑一次** install.sh 即可拿到最新：

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/fixdoc/main/install.sh | bash
```

要锁版本：`FIXDOC_REF=v0.2.0 bash install.sh`。

> install.sh 在已有 `~/.fixdoc/.git` 时走 `fetch + reset --hard FETCH_HEAD`，不会丢用户改动以外的文件——但用户**不应该**直接改 `~/.fixdoc/` 里的源码，他们的本地化在每个项目的 `fixdoc/config.yaml` / `prompt.md` / `template.md` 里。

### 4.4 Release smoke 脚本（建议补）

把下面存为 `scripts/release-smoke.sh` 并 `chmod +x`：

```bash
#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# install fixdoc from the working tree to a sandbox
FIXDOC_SRC="$PWD" \
FIXDOC_HOME="$TMP/home" \
FIXDOC_BIN_DIR="$TMP/bin" \
bash install.sh

export PATH="$TMP/bin:$PATH"

# create a fresh project + init + commit
mkdir "$TMP/proj" && cd "$TMP/proj"
git init -q
git config user.email t@t && git config user.name t
fixdoc init >/dev/null
echo x > a.txt && git add a.txt
git commit -q -m "fixdoc(smoke): release smoke" -m "## test"

test -s fixdoc/queue/pending.jsonl || { echo "FAIL: queue not written"; exit 1; }
fixdoc status | grep -q pending || { echo "FAIL: status missing pending"; exit 1; }

echo "OK: release smoke passed"
```

---

## 5. 内网 / 自托管发布

团队不想走公网时：

1. 在内网 Git 服务器（Gitea / GitLab / 自建 ssh）建一份镜像，`git push --mirror`。
2. 把 `install.sh` 拷到内网静态文件服务器（或直接放仓库 raw url）。
3. 给团队成员发命令：

   ```bash
   FIXDOC_REPO_URL=git@gitlab.internal:tools/fixdoc.git \
     bash <(curl -fsSL https://files.internal/fixdoc/install.sh)
   ```

或者更简单：发个 `setup-fixdoc.sh`，里面已写死内网参数：

```bash
#!/usr/bin/env bash
export FIXDOC_REPO_URL=git@gitlab.internal:tools/fixdoc.git
export FIXDOC_REF=v0.2.0
curl -fsSL https://files.internal/fixdoc/install.sh | bash
```

---

## 6. 升级与回滚

### 用户侧

```bash
# 升到最新
curl -fsSL https://<host>/install.sh | bash

# 锁特定版本
FIXDOC_REF=v0.1.3 bash <(curl -fsSL https://<host>/install.sh)

# 回滚
FIXDOC_REF=v0.1.2 bash <(curl -fsSL https://<host>/install.sh)

# 完全卸载
bash uninstall.sh
```

### 项目侧（已 `fixdoc init` 过的项目）

升级 fixdoc 源码后，新版可能：

- 新增了模板字段 → 用户跑 `fixdoc init --force` 拉模板，但**不会覆盖** `config.yaml`
- 改了 hook 内容 → 同上，`init --force` 会覆盖 `.githooks/post-commit`
- 改了配置默认值 → 用户读 CHANGELOG 自行迁移

**始终要在 CHANGELOG 标注「需要 `fixdoc init --force` 才生效」的项**。

---

## 7. 破坏性变更管理

Phase 1 仍可能有 break。规则：

| 变更 | 处理 |
|------|------|
| 改 `pending.jsonl` 字段 | 加迁移：`hook.js` 启动时检测旧字段，原地改写或忽略；CHANGELOG 写明 |
| 改 `INDEX.md` 表头 | `writer.updateIndex` 做幂等覆盖；旧条目保留 |
| 改 commit 触发规则 | 默认值变更走 minor；保留 `trigger.types` 让用户在 config 里 pin 旧行为 |
| 删 CLI 子命令 | major；旧命令保留 1 版做 warn |

---

## 8. 安全检查清单（每次发版前）

- [ ] **没有 API key 落进 repo**：`grep -RE 'sk-[A-Za-z0-9_-]{30,}' .` 应无命中
- [ ] **shell 注入面**：所有 `git` / `claude` 调用使用 `execFileSync` 数组形式（不要把 SHA / commit body 拼到字符串里走 shell）。当前 `collect.js` 已是数组形式。
- [ ] **install.sh 不 sudo**：默认装到 `~/.fixdoc` / `~/.local/bin`；要求系统目录时由用户显式 `FIXDOC_BIN_DIR=/usr/local/bin sudo ...`
- [ ] **prompt 中要求 LLM 脱敏**：`fixdoc/prompt.md` 中要求把 token / 密码 / API key 替换为 `[REDACTED]`
- [ ] **草稿目录 gitignored**：`init` 会写入 `.gitignore`；防止未 review 的草稿误提交

---

## 9. 已知发布期风险

| 风险 | 缓解 |
|------|------|
| 用户 PATH 没加 `~/.local/bin` | install.sh 会显式打印 export 命令；hook 在找不到 fixdoc 时 fail-open（commit 不阻塞） |
| 用户没装 Claude CLI | `fixdoc generate` 报清晰错误并保留 pending 队列 |
| 用户 git 版本太老（< 2.9，不支持 `core.hooksPath`） | install 时不检查，`fixdoc init` 时也不检查（待补）；建议加预检 |
| 团队成员 clone 后忘记 `git config core.hooksPath .githooks` | 当前必须手动；可考虑把这条写进项目 README 的 onboarding |
| `~/.fixdoc/` 被用户手动改坏 | install.sh `git fetch + reset --hard` 会重置；非 git 模式（FIXDOC_SRC）会 `rm -rf`，**会丢 ~/.fixdoc 内非源码文件**——目前没有用户文件应放在这里，但要在 CHANGELOG 中写清 |

---

## 10. 路线图（发布相关）

| 阶段 | 工作 |
|------|------|
| 当前 | install.sh + uninstall.sh + `fixdoc init`；公开仓库 / 内网镜像均可发 |
| 短期 | release-smoke.sh + CHANGELOG 起步 + git 版本预检 |
| 中期 | GitHub Release 自动化（GitHub Actions：tag → 跑 smoke → 标 latest） |
| 长期（Phase 2） | 单文件二进制（Bun build 或 Deno compile）—— 用户无需 Node |

---

## 11. 一个完整的发版会话示例

```bash
# 0. 在干净分支
git status
git checkout main && git pull

# 1. 改代码、提交（dogfood：用 fixdoc(...) commit）
git commit -m "fixdoc(init): support --force overwriting templates" -m "..."
fixdoc generate --sha HEAD
$EDITOR fixdoc/knowledge/draft/*.md
fixdoc confirm --latest
git add fixdoc/knowledge && git commit -m "docs: fixdoc case init force"

# 2. 升 version
$EDITOR package.json    # 0.1.x → 0.2.0
$EDITOR CHANGELOG.md    # 写本次条目
git add package.json CHANGELOG.md
git commit -m "chore(release): v0.2.0"

# 3. smoke
bash scripts/release-smoke.sh

# 4. tag + push
git tag v0.2.0
git push origin main --tags

# 5. （可选）GitHub Release UI 上把 v0.2.0 标 latest，贴 CHANGELOG 摘要

# 6. 通知团队
# 团队成员重跑 install.sh 即拿到新版
```

---

## 12. FAQ

**Q：为什么不发到 npm？**
A：跨语言团队不希望「为了用 fixdoc 装 Node 项目工程」。Phase 1 用 install.sh + Node 18 兜底，Phase 2 计划编原生二进制，npm 路线优先级最低。

**Q：用户能不能 pin 到某个 commit？**
A：能。`FIXDOC_REF=<commit-sha> bash install.sh`。

**Q：怎么测「全新机器装一遍」？**
A：本机用 Docker：

```bash
docker run --rm -it -v $PWD:/src node:18 bash
# 容器内：
apt-get update && apt-get install -y git
FIXDOC_SRC=/src bash /src/install.sh
export PATH="$HOME/.local/bin:$PATH"
fixdoc help
```

**Q：发出去之后发现关键 bug，怎么办？**
A：
1. fix → 升 patch（v0.2.1）→ tag → push
2. 在 CHANGELOG 标 `### Fixed` 并提示用户重跑 install.sh
3. 严重时在 README 顶部 / GitHub Release 描述里加 ⚠️ 警告
4. 不要 force-push 已发的 tag（用户会 hash mismatch）；总是发 patch 版本

---

发布前最后一道检查：跑 `bash scripts/release-smoke.sh` 看到 `OK: release smoke passed` 再推 tag。
