# Fixdoc 使用文档

Fixdoc 把 `fixdoc:` 类型的 Git commit 自动沉淀成结构化的问题解决文档：
post-commit hook 入队 → `fixdoc generate` 用 Claude CLI 生成草稿 →
人工 review → `fixdoc confirm` 双写到项目 `knowledge/cases/` 与 Obsidian vault，
并更新 `INDEX.md`。

本文档覆盖：环境准备 → 安装 → 配置 → 每一步操作 → 故障排查。

---

## 1. 环境前提

### 1.1 必装

| 依赖 | 最低版本 | 检查命令 | 说明 |
|------|---------|---------|------|
| Git | 2.9+ | `git --version` | 需要支持 `core.hooksPath` |
| Node.js | 18+ | `node -v` | CLI 用 Node 实现 |
| Claude Code CLI | 任意 | `claude --version` | 生成草稿时调用 |

### 1.2 Claude CLI 安装与认证

Fixdoc **不管理** API key，只是调用 `claude` 二进制。

1. 按官方说明安装 Claude Code CLI（macOS 上可 `brew install claude-code`，
   也可下载安装包；具体见 Anthropic 文档）。
2. 完成认证。两种方式择一：
   - **OAuth（推荐）**：终端跑一次 `claude`，按提示在浏览器登录。完成后
     `~/.claude` 下会留下 token，后续非交互调用直接复用。
   - **API key**：在 shell 启动文件设置 `export ANTHROPIC_API_KEY=sk-...`。
3. 验证：
   ```bash
   echo "say hi" | claude -p
   ```
   能看到模型回复即可。

> 注意：Claude CLI 的「认证状态」是 fixdoc 调不调得通的关键。若 `fixdoc generate`
> 报 `Claude CLI exited <n>` 且含 `auth/login/unauthor` 字样，回到这一步重做。

### 1.3 可选：Obsidian vault

- 准备好你想存放 postmortem 的 vault 目录的**绝对路径**，例如
  `/Users/joji/Documents/MyVault`。
- 不用 Obsidian 也行，把配置里 `output.obsidian_vault` 留空即可，只写项目内 cases。

---

## 2. 安装 Fixdoc

### 2.1 获取源码

把 fixdoc 仓库放到一个固定目录。本文以 `/Users/joji/work/fixdoc` 为例。

```bash
cd /Users/joji/work
git clone <fixdoc-repo-url> fixdoc        # 或 cp -r 已有源码
cd fixdoc
```

### 2.2 让 `fixdoc` 命令全局可用（二选一）

**方式 A（推荐）：`npm link`**

```bash
cd /Users/joji/work/fixdoc
npm link
which fixdoc          # 应该输出 npm 全局 bin 下的软链
fixdoc help
```

**方式 B：shell 别名**

在 `~/.zshrc`（或 `~/.bashrc`）追加：

```bash
alias fixdoc='node /Users/joji/work/fixdoc/fixdoc/bin/fixdoc.js'
```

然后 `source ~/.zshrc`。

> 卸载 `npm link`：`cd` 到 fixdoc 仓库后 `npm unlink -g fixdoc`。

### 2.3 在你要追踪的项目里激活 Git hook

**重要：fixdoc 的核心代码、queue、knowledge 目录都生活在 fixdoc 仓库自身里。
post-commit hook 也只对 fixdoc 这个仓库生效。** 也就是说：

- 你在 `/Users/joji/work/fixdoc` 里改代码并 `git commit -m "fixdoc(...): ..."`
  时，hook 会入队。
- 若你想让**别的**项目也享受 fixdoc 工作流，需要把 fixdoc 那套源码（或软链）
  以及 `.githooks/` 一并放进那个项目，并把 `core.hooksPath` 指向那里。
  Phase 1 没有 "fixdoc init" 一键脚手架，需要手动放置。

在 fixdoc 仓库内一次性DD激活：

```bash
cd /Users/joji/work/fixdoc
git config core.hooksPath .githooks
```

验证：

```bash
git config core.hooksPath           # 输出: .githooks
ls -l .githooks/post-commit         # 应可执行
```

### 2.4 生成本地配置

```bash
cp fixdoc/config.example.yaml fixdoc/config.yaml
```

编辑 `fixdoc/config.yaml`，最少要决定 `output.obsidian_vault`。详见 §3。

> `fixdoc/config.yaml` 被 gitignore，不会进版本库。

---

## 3. 配置说明（`fixdoc/config.yaml`）

```yaml
llm:
  provider: claude-cli           # Phase 1 只支持 claude-cli
  command: claude                # 若 claude 不在 PATH，写绝对路径
  args: ["-p"]                   # 非交互模式
  timeout_ms: 120000             # Claude 调用超时（毫秒）

output:
  project_dir: fixdoc/knowledge/cases     # 入库的 case 目录
  draft_dir: fixdoc/knowledge/draft       # 草稿目录（gitignored）
  index_file: fixdoc/knowledge/INDEX.md   # 自动维护的索引表
  obsidian_vault: ""                      # ← 改成你的 vault 绝对路径；留空跳过 Obsidian
  obsidian_subdir: Knowledge/Postmortems  # vault 内子目录
  require_draft_review: true              # 始终走草稿审阅流程

diff:
  max_lines: 500                # diff 超过这个行数会被截断后再传给 Claude
  context_lines: 3              # git show -U<N>

trigger:
  types: [fixdoc, hotfix]       # 哪些 commit type 触发
  tags: [autodoc]               # 哪些 #tag 也触发
  severity_tags:                # body 里出现这些 tag 时改变文档详细程度
    urgent: autodoc-urgent
    minor: autodoc-minor
```

**关键字段：**

- `output.obsidian_vault`：留空 → 只写项目 cases；设了路径但路径不存在 →
  `fixdoc confirm` 会报错并中止（不会静默丢失数据）。
- `llm.command`：如果你 shell 里 `which claude` 输出的是别的路径（比如 `claude-code`），
  在这里覆盖。
- `diff.max_lines`：太大的 diff 会占用 token、可能让 Claude 超时；建议保持默认 500。

---

## 4. 日常工作流（每一步）

### Step 1 — 写代码 + 提交 `fixdoc:` commit

只有匹配触发规则的 commit 才会入队。规则：

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

Severity tag（写在 body 里任意位置）：

| tag | 文档详细程度 |
|-----|-------------|
| `#autodoc-urgent` | 完整版（含回滚 / 影响面 / 预防） |
| `#autodoc-minor`  | 精简版（摘要 + 根因 + 修复） |
| 不写             | 标准版（默认模板全章节） |

commit 完成后，会在终端看到：

```
[fixdoc] queued abc1234 (fixdoc) — run `fixdoc generate`
```

**hook 不会调用 LLM，不会阻塞 commit；它失败时也只是不入队，commit 照常成功（fail-open）。**

### Step 2 — 查看待处理项

```bash
fixdoc status
```

输出例：

```
Queue (1 pending, 0 drafted, 0 completed):
  abc1234  fixdoc(auth): fix token refresh race     pending

Drafts awaiting review (0):
  (none)

Note: obsidian_vault is empty — confirm will skip Obsidian write.
```

如果 `obsidian_vault` 路径不存在，会在最后多一行 `Warning: ...` 提示。

### Step 3 — 生成草稿

```bash
fixdoc generate                  # 处理 queue 里最早的 pending
fixdoc generate --sha abc1234    # 指定 commit（即使没入队也可临时生成）
fixdoc generate --all            # 把所有 pending 一次处理完
```

执行时会调用 Claude CLI（注意：会消耗你 Claude 账号的 quota 或 API 余额）。
成功后会打印：

```
[fixdoc] generating for abc1234 (fixdoc/standard)...
[fixdoc] draft → fixdoc/knowledge/draft/2026-05-22-auth-fix-token-refresh-race-abc1234.md
         review, then run: fixdoc confirm 2026-05-22-auth-fix-token-refresh-race-abc1234.md
```

队列里的状态会从 `pending` 变成 `drafted`。

**失败时**会保留 `pending` 状态，方便修问题后重试。常见原因见 §6。

### Step 4 — 人工 review 草稿

打开 `fixdoc/knowledge/draft/<日期>-<slug>-<shortSha>.md`：

- 修正事实错误（Claude 偶尔会脑补，请逐条核对）。
- 删除/补充章节。
- 确认 frontmatter 里的 `id`（commit SHA）、`date`、`scope`、`severity`、`affected`。
- 检查是否有未被脱敏的 token、URL、密码——这一步你来兜底。

### Step 5 — confirm 归档

```bash
fixdoc confirm 2026-05-22-auth-fix-token-refresh-race-abc1234.md
# 或：fixdoc confirm --latest   （选最近修改的那份草稿）
```

发生的事情：

1. 复制草稿 → `fixdoc/knowledge/cases/<同名>.md`
2. 若配置了 `obsidian_vault`：复制到 `<vault>/<obsidian_subdir>/<同名>.md`，末尾若无「相关链接」段则自动追加 `[[fixdoc-cases-index]]` 双链。
3. 更新 `fixdoc/knowledge/INDEX.md`，在表头下方插入一行。
4. queue 对应 SHA 标记 `completed`。
5. 草稿移动到 `fixdoc/knowledge/draft/archived/`。

终端会提示下一步：

```
[fixdoc] draft archived. Next: git add fixdoc/knowledge/cases && git commit -m "docs: fixdoc case ..."
```

### Step 6 — 把 cases 提交到 Git

```bash
git add fixdoc/knowledge/cases fixdoc/knowledge/INDEX.md
git commit -m "docs: fixdoc case auth token race"
```

`draft/` 和 `queue/pending.jsonl` 是 gitignore 的，不会被提交。

---

## 5. 命令速查

| 命令 | 作用 |
|------|------|
| `fixdoc help` | 用法概览 |
| `fixdoc status` | 显示 queue + 待 review 草稿 |
| `fixdoc generate` | 处理 queue 里最早 pending |
| `fixdoc generate --sha <sha>` | 处理指定 commit（不在 queue 也行） |
| `fixdoc generate --all` | 处理所有 pending |
| `fixdoc confirm <draft.md>` | 归档指定草稿 |
| `fixdoc confirm --latest` | 归档最近修改的草稿 |

---

## 6. 故障排查

### `fixdoc: command not found`
没 `npm link` 或没设 alias。回到 §2.2。临时方案：直接 `node /path/to/fixdoc/bin/fixdoc.js ...`。

### `[fixdoc] error: Claude CLI not found (claude)`
PATH 里找不到 `claude` 二进制。
- 确认 `which claude` 能找到；
- 或在 `fixdoc/config.yaml` 的 `llm.command` 写绝对路径。

### `Claude CLI exited <n>: ... — run \`claude\` interactively to complete login`
认证过期或没登录。跑一次 `claude`（不带 `-p`）走 OAuth，或设 `ANTHROPIC_API_KEY`。

### `Claude CLI timed out after 120000ms`
- diff 太大 → 调小 `diff.max_lines`；
- 网络/服务慢 → 调大 `llm.timeout_ms`；
- 重试一次（队列条目仍是 pending，状态没动）。

### `obsidian_vault path does not exist: ...`
配置里写的路径不存在。修正 `output.obsidian_vault`，或留空跳过 Obsidian 写入。confirm 在路径错时会直接报错并中止——这是有意的，避免静默丢稿。

### post-commit 没有入队
- `git config core.hooksPath` 输出是不是 `.githooks`？
- `.githooks/post-commit` 是否可执行？`chmod +x .githooks/post-commit`。
- commit 的首行是否真的匹配 `fixdoc(...)?: ...` 或 `hotfix(...)?: ...`？只看第一行。
- 想强触发可在 body 里加 `#autodoc`。

### 同一 commit 想重新生成
queue 不会重复入同一个 SHA。直接：

```bash
fixdoc generate --sha <sha>
```

会覆盖该 SHA 现有 draft（文件名含 short SHA，所以同 SHA 必同名）。

### 想撤掉 hook
```bash
git config --unset core.hooksPath
```

---

## 7. 目录与文件作用

```
fixdoc/
├── docs/
│   ├── PRD.md            产品需求文档
│   └── USAGE.md          本文档
├── package.json          npm link 的入口定义
├── .githooks/
│   ├── post-commit       入队脚本（fail-open）
│   └── README.md
└── fixdoc/
    ├── bin/fixdoc.js     CLI 入口
    ├── lib/              collect / config / prompt / queue / trigger / writer / claude-cli
    ├── prompt.md         发给 Claude 的系统指令
    ├── template.md       输出文档结构模板
    ├── config.example.yaml
    ├── config.yaml       ← 你的本地配置（gitignored）
    ├── queue/
    │   └── pending.jsonl ← 队列（gitignored）
    └── knowledge/
        ├── INDEX.md      自动维护的案例索引
        ├── cases/        入库的最终文档
        └── draft/        草稿（gitignored），confirm 后挪到 draft/archived/
```

---

## 8. 一个最小完整跑通示例

```bash
# 1) 准备
cd /Users/joji/work/fixdoc
npm link
git config core.hooksPath .githooks
cp fixdoc/config.example.yaml fixdoc/config.yaml
# 编辑 fixdoc/config.yaml，把 obsidian_vault 改成你的 vault 路径（可留空）

# 2) 提交一个 fixdoc commit
echo "// patch" >> some-file.js
git add some-file.js
git commit \
  -m "fixdoc(parser): handle empty payload" \
  -m "## 问题现象
解析器在 payload 为空时抛 NPE。

## 修复
提前判空并返回默认结构。"

# → 终端: [fixdoc] queued <sha> (fixdoc) — run `fixdoc generate`

# 3) 看队列
fixdoc status

# 4) 生成草稿（需要 claude 可调用）
fixdoc generate
# → 终端给出 draft 路径

# 5) 打开 draft 文件 review、编辑

# 6) 确认归档
fixdoc confirm --latest

# 7) 把 case 提交到仓库
git add fixdoc/knowledge/cases fixdoc/knowledge/INDEX.md
git commit -m "docs: fixdoc case parser empty payload"
```

完成。新人或 AI 之后可以从 `fixdoc/knowledge/INDEX.md` 检索全部历史 case。
