# Fixdoc 使用文档

Fixdoc 把 `fixdoc:` 类型的 Git commit 自动沉淀成结构化的问题解决文档：
post-commit hook 入队 → `fixdoc generate` 用 Claude CLI 生成草稿 →
人工 review → `fixdoc confirm` 双写到项目 `knowledge/cases/` 与 Obsidian vault，
并更新 `INDEX.md`。

模型：**每台机器装一次 fixdoc → 每个项目 `fixdoc init` 一次 → 团队成员各自装一次 fixdoc 即可共享同一套工作流。**

---

## 1. 环境前提

| 依赖 | 最低版本 | 检查命令 | 说明 |
|------|---------|---------|------|
| Git | 2.9+ | `git --version` | 需要支持 `core.hooksPath` |
| Node.js | 18+ | `node -v` | fixdoc 是 Node 实现的 |
| Bash | 任意 | `bash --version` | 安装脚本与 hook 用 |
| Claude Code CLI | 任意 | `claude --version` | `fixdoc generate` 时调用 |

### Claude CLI 准备

Fixdoc 不管理 API key，只调用 `claude` 二进制。

1. 按官方说明安装 Claude Code CLI（macOS 上 `brew install claude-code`，或下载安装包）。
2. 认证（择一）：
   - 终端跑一次 `claude`，浏览器登录（推荐，token 写到 `~/.claude`）
   - 或 `export ANTHROPIC_API_KEY=sk-...`
3. 验证：`echo "ping" | claude -p` 能看到模型回复。

> 若 `fixdoc generate` 报含 `auth/login/unauthor` 字样的错误，回到这一步重做认证。

### Obsidian vault（可选）

准备 vault 目录的**绝对路径**（如 `/Users/joji/Documents/MyVault`）。不用 Obsidian 把配置留空即可。

---

## 2. 安装 Fixdoc（一次性，每台机器一次）

### 一行安装

```bash
curl -fsSL https://<host>/install.sh | bash
```

默认会：
- 把 fixdoc 源码放到 `~/.fixdoc/`
- 在 `~/.local/bin/fixdoc` 写一个 shim 启动器
- 提示是否需要把 `~/.local/bin` 加进 PATH

### 自定义安装路径

```bash
FIXDOC_HOME=/opt/fixdoc \
FIXDOC_BIN_DIR=/usr/local/bin \
bash install.sh
```

### 本地源码安装（开发 / 内网）

```bash
FIXDOC_SRC=/path/to/cloned/fixdoc bash install.sh
```

### 验证

```bash
fixdoc help
# 看到 Usage 即成功
```

### 卸载

```bash
bash uninstall.sh
# 或: rm -rf ~/.fixdoc ~/.local/bin/fixdoc
```

> 卸载不会动你已 `fixdoc init` 过的项目。要清那些项目里的 fixdoc：
> `git config --unset core.hooksPath && rm -rf .githooks fixdoc`

---

## 3. 接入一个项目（每个项目一次）

进入任意 git 项目根目录（**不限语言**：Python / Go / Rust / TS 都可以），执行：

```bash
cd /path/to/your-project
fixdoc init
```

发生的事：

```
+ .githooks/post-commit
+ .githooks/README.md
+ fixdoc/config.example.yaml
+ fixdoc/prompt.md
+ fixdoc/template.md
+ fixdoc/config.yaml (from example)
+ fixdoc/knowledge/INDEX.md
+ fixdoc/knowledge/cases/.gitkeep
+ .gitignore: fixdoc/queue/pending.jsonl, fixdoc/config.yaml, fixdoc/knowledge/draft/
+ git config core.hooksPath .githooks
```

**写进项目的只有数据 + 模板 + 一个 bash hook**，没有任何 JS 源码。hook 通过 PATH 上的 `fixdoc` 命令工作，不依赖项目里有 Node 工程。

### 二次执行

`fixdoc init` 默认不覆盖已存在的文件。要强制覆盖模板（不会覆盖你已编辑的 `config.yaml`）：

```bash
fixdoc init --force
```

### `core.hooksPath` 冲突

若项目已设置 `core.hooksPath` 指向别的目录（例如 husky），init 会留下警告而不强行改写；你需要把 `.githooks/post-commit` 内容并入你已有的 hooks 目录。

### 把 fixdoc 提交给团队

```bash
git add fixdoc .githooks .gitignore
git commit -m "chore: add fixdoc"
git push
```

队友拉下后只需一次：

1. `bash <(curl -fsSL https://<host>/install.sh)`（如果他还没装 fixdoc）
2. `git config core.hooksPath .githooks`（init 已经做过；克隆出来的 `.git/config` 不会包含这条，所以**每位队友都要执行一次**——这是 git 的限制）

> 想自动化第 2 步：可以加个 `npm postinstall` / `Makefile` 目标。但跨语言项目通用做法仍是写进 README。

---

## 4. 配置（`fixdoc/config.yaml`）

```yaml
llm:
  provider: claude-cli           # Phase 1 只支持 claude-cli
  command: claude                # 若 claude 不在 PATH，写绝对路径
  args: ["-p"]                   # 非交互模式
  timeout_ms: 120000             # Claude 调用超时

output:
  project_dir: fixdoc/knowledge/cases     # 入库目录
  draft_dir: fixdoc/knowledge/draft       # 草稿（gitignored）
  index_file: fixdoc/knowledge/INDEX.md
  obsidian_vault: ""                      # ← Obsidian vault 绝对路径，留空则跳过
  obsidian_subdir: Knowledge/Postmortems
  require_draft_review: true

diff:
  max_lines: 500
  context_lines: 3

trigger:
  types: [fixdoc, hotfix]
  tags: [autodoc]
  severity_tags:
    urgent: autodoc-urgent
    minor: autodoc-minor
```

关键字段：

- `output.obsidian_vault`：留空 → 只写项目 cases；设了路径但不存在 → `fixdoc confirm` 报错并中止（防止静默丢稿）
- `llm.command`：覆盖 claude 二进制路径
- `diff.max_lines`：太大的 diff 会被截断后再传给 Claude

`fixdoc/config.yaml` 已被 init 加入 `.gitignore`，每个团队成员的本地配置互不干扰。

---

## 5. 日常工作流

### Step 1 — 写代码 + 提交 `fixdoc:` commit

只有匹配触发规则的 commit 才入队：

| 写法 | 触发？ |
|------|--------|
| `fixdoc(auth): fix token refresh race` | ✅ |
| `fixdoc!: drop legacy session API`     | ✅ |
| `hotfix(api): null-deref on /login`    | ✅ |
| commit body 含 `#autodoc`              | ✅ |
| `fix: typo` / `feat: ...` / `chore: ...` | ❌ |

推荐写法（subject 简短，body 给上下文）：

```bash
git commit \
  -m "fixdoc(auth): fix token refresh race" \
  -m "## 问题现象
偶发 401，发生在 refresh token 即将过期时多端并发刷新。

## 调试线索
- 日志: token mismatch at /v2/refresh
- 影响范围: ~5% 长时间登录用户

#autodoc-urgent"
```

Severity tag（写在 body 任意位置）：

| tag | 文档详细程度 |
|-----|-------------|
| `#autodoc-urgent` | 完整版 |
| `#autodoc-minor`  | 精简版 |
| 不写             | 标准版 |

commit 完成后终端会显示：

```
[fixdoc] queued abc1234 (fixdoc) — run `fixdoc generate`
```

**hook 不调 LLM、不阻塞 commit；fixdoc 没装时只 warn 一行也不阻塞 commit（fail-open）。**

### Step 2 — 查看待处理项

```bash
fixdoc status
```

```
Queue (1 pending, 0 drafted, 0 completed):
  abc1234  fixdoc(auth): fix token refresh race     pending

Drafts awaiting review (0):
  (none)
```

### Step 3 — 生成草稿（调用 Claude）

```bash
fixdoc generate                  # 处理 queue 里最早的 pending
fixdoc generate --sha abc1234    # 指定 commit
fixdoc generate --all            # 一次处理全部 pending
```

输出：

```
[fixdoc] generating for abc1234 (fixdoc/standard)...
[fixdoc] draft → fixdoc/knowledge/draft/2026-05-22-auth-fix-token-refresh-race-abc1234.md
         review, then run: fixdoc confirm 2026-05-22-auth-fix-token-refresh-race-abc1234.md
```

失败会保留 `pending` 状态以便重试。

### Step 4 — review 草稿

打开 `fixdoc/knowledge/draft/<date>-<slug>-<shortSha>.md`：

- 修事实错误（Claude 偶尔脑补）
- 删除/补充章节
- 检查 frontmatter（`id` 是 commit SHA，`date`、`scope`、`severity`、`affected`）
- 兜底检查是否有未脱敏的 token / 密码 / 内网 URL

### Step 5 — confirm 归档

```bash
fixdoc confirm 2026-05-22-auth-fix-token-refresh-race-abc1234.md
# 或: fixdoc confirm --latest
```

会发生：

1. 草稿 → `fixdoc/knowledge/cases/<同名>.md`
2. 若配置了 vault：→ `<vault>/<obsidian_subdir>/<同名>.md`，自动追加 `[[fixdoc-cases-index]]` 双链
3. 更新 `fixdoc/knowledge/INDEX.md`
4. queue 标记 `completed`
5. 草稿移到 `fixdoc/knowledge/draft/archived/`

### Step 6 — 把 case 提交到 Git

```bash
git add fixdoc/knowledge/cases fixdoc/knowledge/INDEX.md
git commit -m "docs: fixdoc case auth token race"
```

---

## 6. 命令速查

| 命令 | 作用 |
|------|------|
| `fixdoc help` | 用法 |
| `fixdoc init [--force]` | 在当前 git 项目里安装 hook + 模板 |
| `fixdoc status` | queue + 草稿状态 |
| `fixdoc generate` | 处理最早 pending |
| `fixdoc generate --sha <sha>` | 指定 commit |
| `fixdoc generate --all` | 所有 pending |
| `fixdoc confirm <draft.md>` | 归档指定草稿 |
| `fixdoc confirm --latest` | 归档最近草稿 |

> 内部命令：`fixdoc _hook` — 仅由 `.githooks/post-commit` 调用，不要手动跑。

---

## 7. 故障排查

| 现象 | 解决 |
|------|------|
| `fixdoc: command not found` | install.sh 提示的 PATH 没加；或 `~/.local/bin` 不在 PATH |
| commit 后无 `[fixdoc] queued ...` | `git config core.hooksPath` 输出是否 `.githooks`？hook 是否可执行？commit 首行是否真的匹配 `fixdoc(...)?: ...`？ |
| `[fixdoc] hook installed but fixdoc not found on PATH` | 队友未装 fixdoc。让他跑 install.sh。commit 不会被阻塞 |
| `Claude CLI not found (claude)` | `which claude` 检查；或在 `fixdoc/config.yaml` 写 `llm.command` 绝对路径 |
| `Claude CLI exited <n>: ... auth/login/...` | 跑一次 `claude` 完成 OAuth，或设 `ANTHROPIC_API_KEY` |
| `Claude CLI timed out after 120000ms` | 调小 `diff.max_lines`，或调大 `llm.timeout_ms`，或重试（queue 仍 pending） |
| `obsidian_vault path does not exist` | 修正路径，或留空跳过 |
| 想撤掉 hook | `git config --unset core.hooksPath` |
| 想重新生成同一 commit 的草稿 | `fixdoc generate --sha <sha>`，文件名含 short SHA 会覆盖旧草稿 |

---

## 8. 目录与文件作用

**fixdoc 安装位置（`~/.fixdoc/`，或 `FIXDOC_HOME`）：**

```
~/.fixdoc/
├── fixdoc/
│   ├── bin/fixdoc.js   CLI 入口
│   ├── lib/            实现：collect / config / hook / init / prompt / queue / trigger / writer / llm
│   ├── prompt.md       发给 Claude 的系统指令模板源
│   ├── template.md     输出文档结构模板源
│   └── config.example.yaml
└── .githooks/post-commit   被 `fixdoc init` 复制到目标项目
```

**目标项目（`fixdoc init` 之后）：**

```
your-project/
├── .githooks/
│   ├── post-commit       入队脚本（fail-open，调全局 fixdoc）
│   └── README.md
├── .gitignore            （追加了 fixdoc/queue/pending.jsonl 等三行）
└── fixdoc/
    ├── config.example.yaml
    ├── config.yaml       ← 你的本地配置（gitignored）
    ├── prompt.md         可按项目改 Claude 系统提示
    ├── template.md       可按项目改文档结构
    ├── queue/
    │   └── pending.jsonl ← 队列（gitignored）
    └── knowledge/
        ├── INDEX.md      自动维护的案例索引
        ├── cases/        入库的最终文档
        └── draft/        草稿（gitignored）
```

---

## 9. 端到端最小示例

```bash
# 一次性: 装 fixdoc
curl -fsSL https://<host>/install.sh | bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
fixdoc help

# 接入一个项目（不管什么语言）
cd /path/to/my-go-project
fixdoc init
$EDITOR fixdoc/config.yaml   # 改 obsidian_vault（可选）
git add fixdoc .githooks .gitignore && git commit -m "chore: add fixdoc"

# 日常
echo "// patch" >> main.go && git add main.go
git commit -m "fixdoc(parser): handle empty payload" \
           -m "## 问题现象
解析器在 payload 为空时抛 panic。
## 修复
提前判空并返回默认结构。"
# → [fixdoc] queued <sha> (fixdoc) — run `fixdoc generate`

fixdoc status
fixdoc generate
$EDITOR fixdoc/knowledge/draft/*.md     # review
fixdoc confirm --latest
git add fixdoc/knowledge && git commit -m "docs: fixdoc case parser empty payload"
```

完成。`fixdoc/knowledge/INDEX.md` 是团队和未来的 AI 检索历史 case 的入口。
