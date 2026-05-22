# Fixdoc — 产品需求文档（PRD）

| 字段 | 内容 |
|------|------|
| 产品名称 | Fixdoc |
| 版本 | Phase 1 MVP |
| 文档版本 | v1.0 |
| 日期 | 2026-05-21 |
| 状态 | 已确认配置，待开发 |
| 参考 | [git-hook-brainstorm.md](/Users/joji/.qoderwork/workspace/mpf8qsbarr1qvrew/outputs/git-hook-brainstorm.md)、Fixdoc 技术方案（plan） |

---

## 1. 产品概述

### 1.1 一句话描述

Fixdoc 是一套 **vendor-agnostic** 的 Git 工作流工具：当开发者使用 `fixdoc:` 类型的 commit 提交值得沉淀的问题修复时，通过命令行调用 Claude 生成结构化问题解决文档，经人工 review 后双写到 **项目 Git 知识库** 与 **Obsidian vault**。

### 1.2 核心价值

| 对象 | 价值 |
|------|------|
| 开发者 | 修复 bug 后无需从零写文档；commit body 模板降低思考负担 |
| 团队 | `fixdoc/knowledge/cases/` 入库 Git，新人/AI 可检索历史修复 |
| 个人 | Obsidian 知识库自动积累，支持双链与图谱 |
| 组织 | 控制触发范围（仅 `fixdoc`），避免每次 commit 都调 LLM |

### 1.3 设计原则

1. **不绑定任何 IDE** — Phase 1 无 IDE 适配层
2. **Git + CLI 为核心** — 任何终端、任何 Git 客户端可用
3. **LLM 可插拔** — Phase 1 默认 Claude CLI，后续可换 API / 其他模型
4. **人工把关** — 默认 draft review，确认后才归档
5. **配置本地化** — Obsidian vault 等路径由用户自行配置，不写死

---

## 2. 背景与问题

### 2.1 现状痛点

- Bug 修复完成后，问题解决过程 rarely 被文档化（覆盖率约 20%）
- 重复问题出现时，开发者不知道团队之前如何修复
- 写 postmortem / RCA 文档时不知道应包含哪些维度
- 知识分散在 PR 描述、Slack、个人笔记，无法被 AI 或新人复用

### 2.2 机会

- Conventional Commits 可扩展新 type（`fixdoc`）
- Git hooks 可在 commit 后无阻塞地记录待处理任务
- Claude CLI（`claude -p`）可在命令行非交互生成文档
- Obsidian + 项目 Markdown 可服务「人读」与「机器读」两种场景

### 2.3 明确不做（Out of Scope — Phase 1）

| 不做 | 原因 |
|------|------|
| Cursor / IDE hooks | Phase 1 范围外；Phase 2+ 可选 |
| pre-commit 强制拦截 | 易引发绕过，与「赋能」原则冲突 |
| 所有 commit 类型都生成文档 | 噪音大、ROI 低 |
| 默认本地 LLM | 代码理解质量不稳定；Phase 2 可选 Ollama adapter |
| daemon 全自动消费队列 | Phase 2；Phase 1 手动 `fixdoc generate` |
| 历史相似问题自动关联 | Phase 2；需检索/RAG |

---

## 3. 已确认的产品决策

以下决策已在需求讨论中确认，**Phase 1 必须遵守**：

| # | 决策项 | 确认结果 |
|---|--------|----------|
| 1 | Commit 触发 type | **`fixdoc`**（主推）；可选 `hotfix`；`#autodoc` 标记可触发 |
| 2 | Obsidian vault | **用户可配置**（`fixdoc/config.yaml` → `output.obsidian_vault`） |
| 3 | 默认 LLM | **Claude CLI**（`claude -p`，非直接 HTTP API） |
| 4 | cases 是否入库 | **是**，`fixdoc/knowledge/cases/` 提交到 Git |
| 5 | Draft review | **启用**（`require_draft_review: true`） |
| 6 | Cursor 适配 | **Phase 1 不包含** |
| 7 | 队列文件 | `fixdoc/queue/pending.jsonl` **不入库**（.gitignore） |

---

## 4. 用户画像与场景

### 4.1 目标用户

- 独立开发者或小团队工程师
- 使用 Git + 终端（或任意 IDE 内置终端）
- 已安装 Claude Code CLI（`claude`）
- 使用 Obsidian 做个人知识管理

### 4.2 核心用户故事

| ID | 作为… | 我希望… | 以便… |
|----|--------|---------|--------|
| US-01 | 开发者 | 用 `fixdoc(scope):` commit 修复 | 系统自动识别并排队文档任务 |
| US-02 | 开发者 | 运行 `fixdoc generate` | Claude 根据 diff 和 commit body 生成草稿 |
| US-03 | 开发者 | 在 draft 中 review 并 `fixdoc confirm` | 准确内容才进入 cases 和 Obsidian |
| US-04 | 开发者 | 配置 Obsidian vault 路径 | 文档写到我的知识库目录 |
| US-05 | 开发者 | cases 在 Git 中 | 团队共享、可版本追溯 |
| US-06 | 开发者（未来） | 换 OpenAI / Ollama | 只改 config，不改工作流 |

### 4.3 典型流程（Happy Path）

```
修复 bug
  → git commit -m "fixdoc(auth): fix token refresh race" -m "## 问题现象\n..."
  → post-commit 写入 queue
  → fixdoc generate
  → Claude 生成 draft
  → 开发者 review / 微调 draft
  → fixdoc confirm <draft-id>
  → 归档到 knowledge/cases/ + Obsidian，更新 INDEX.md
  → git add fixdoc/knowledge && git commit
```

---

## 5. 功能需求

### 5.1 触发与识别（FR-01）

**需求**：识别应生成文档的 commit。

| 规则 | 条件 |
|------|------|
| 主规则 | commit message 首行匹配 `^fixdoc(\([^)]+\))?!?:` |
| 扩展规则 | 首行以 `hotfix` 开头 |
| 标记规则 | body 或 subject 含 `#autodoc` |
| 排除 | `fix` / `feat` / `chore` / `docs` 等默认不触发 |

**Severity 标记**（影响生成详细程度）：

| 标记 | 文档模式 |
|------|----------|
| `#autodoc-urgent` | 完整版（含回滚、影响面、预防） |
| `#autodoc-minor` | 精简版（摘要 + 根因 + 方案） |
| 无标记 | 标准版（默认模板全章节） |

**验收标准**：
- [ ] 符合规则的 commit 被写入 `fixdoc/queue/pending.jsonl`
- [ ] 不符合规则的 commit 不产生 queue 条目
- [ ] 同一 SHA 不重复入队

---

### 5.2 Git Hooks（FR-02）

**需求**：项目安装 Git hooks，commit 后自动入队。

| Hook | 职责 | Phase |
|------|------|-------|
| `post-commit` | 检测 fixdoc commit → 写 queue | Phase 1 |
| `prepare-commit-msg` | 注入 commit body 模板 | Phase 1.5（可选） |

**post-commit 行为**：
- 读取 `HEAD` commit message
- 若匹配触发规则，追加一行 JSON 到 `fixdoc/queue/pending.jsonl`：
  ```json
  {"sha":"abc1234","queued_at":"2026-05-21T10:00:00Z","status":"pending"}
  ```
- 执行时间 < 50ms，不调用 LLM

**安装方式**：
```bash
git config core.hooksPath .githooks
```

**验收标准**：
- [ ] `fixdoc:` commit 后 queue 文件有新条目
- [ ] 普通 `fix:` commit 不产生条目
- [ ] hook 失败不阻断 git commit（fail-open）

---

### 5.3 CLI — `fixdoc generate`（FR-03）

**需求**：从 queue 或指定 SHA 生成文档草稿。

**命令**：
```bash
fixdoc generate              # 处理 queue 中最早 pending 条目
fixdoc generate --sha abc123 # 处理指定 commit
fixdoc generate --all        # 处理 queue 中全部 pending（Phase 1 可选）
```

**处理步骤**：
1. 读取 `fixdoc/config.yaml`
2. `collect(sha)`：获取 commit message、body、`git show --stat`、`git show -U3`（diff 摘要）
3. 组装 `prompt.md` + `template.md` + collect 结果
4. 调用 **Claude CLI**：`claude -p "<assembled prompt>"`（或 `--system-prompt-file` + stdin）
5. 解析输出 Markdown
6. 写入 `fixdoc/knowledge/draft/{date}-{slug}.md`
7. 更新 queue 条目 status → `drafted`
8. 终端输出 draft 路径与 `fixdoc confirm` 提示

**Diff 摘要策略**：
- 默认 `-U3`（3 行上下文）
- 超过 `diff.max_lines`（默认 500）时截断并注明
- 始终包含 `--stat` 和 `--name-only`

**验收标准**：
- [ ] 成功生成 draft 文件，含完整 frontmatter
- [ ] Claude CLI 调用失败时有明确错误信息
- [ ] 无 API key 时提示配置 Claude CLI 认证

---

### 5.4 CLI — `fixdoc confirm`（FR-04）

**需求**：人工确认草稿后正式归档（draft review 流程）。

**命令**：
```bash
fixdoc confirm 2026-05-21-auth-token-race.md
fixdoc confirm --latest          # 确认最新 draft
```

**处理步骤**：
1. 读取 draft 文件
2. 复制到 `fixdoc/knowledge/cases/{date}-{slug}.md`
3. 若配置了 Obsidian vault，写入 `{obsidian_vault}/{obsidian_subdir}/{date}-{slug}.md`
   - Obsidian 版增加 `[[双链]]` 和 tags（基于 template 规则）
4. 更新 `fixdoc/knowledge/INDEX.md` 索引表
5. 删除或移动 draft 到 `draft/archived/`
6. 更新 queue status → `completed`

**验收标准**：
- [ ] confirm 后 cases 文件存在且内容正确
- [ ] Obsidian 文件写入配置的 vault（vault 未配置时跳过并 warn）
- [ ] INDEX.md 新增一行
- [ ] 重复 confirm 同一 draft 报错或幂等提示

---

### 5.5 CLI — `fixdoc status`（FR-05）

**需求**：查看 queue 与 draft 状态。

**命令**：
```bash
fixdoc status
```

**输出示例**：
```
Queue (2 pending, 1 drafted, 5 completed):
  abc1234  fixdoc(auth): ...     pending
  def5678  fixdoc(ui): ...       drafted → draft/2026-05-21-ui-fix.md

Drafts awaiting review (1):
  2026-05-21-auth-token-race.md
```

**验收标准**：
- [ ] 正确统计各状态数量
- [ ] 无 queue 时输出友好提示

---

### 5.6 配置（FR-06）

**需求**：用户通过 `fixdoc/config.yaml` 配置路径与 LLM。

**默认配置（Phase 1）**：

```yaml
llm:
  provider: claude-cli          # Phase 1 仅实现 claude-cli
  command: claude               # 可覆盖二进制路径
  args: ["-p"]                  # 非交互打印模式
  # model 由 Claude CLI 自身配置决定

output:
  project_dir: fixdoc/knowledge/cases
  draft_dir: fixdoc/knowledge/draft
  index_file: fixdoc/knowledge/INDEX.md
  obsidian_vault: ""            # 用户必填或留空跳过 Obsidian 写入
  obsidian_subdir: Knowledge/Postmortems
  require_draft_review: true    # 已确认：启用

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

**Obsidian vault 配置说明**：
- 用户将 `obsidian_vault` 设为绝对路径，例如 `/Users/joji/Documents/MyVault`
- 留空或 null：仅写项目 cases，跳过 Obsidian（warn 一次）
- 路径不存在：confirm 时报错，不静默失败

**验收标准**：
- [ ] 缺少 config 时使用合理默认值（除 obsidian_vault）
- [ ] 配置变更无需改代码，重启 CLI 即生效

---

### 5.7 文档模板（FR-07）

**需求**：AI 输出必须符合固定结构，便于检索与 Obsidian 解析。

**项目 cases 版**（`fixdoc/template.md`）— 入库 Git：

```markdown
---
id: {commit-sha}
date: {commit-date}
type: bugfix
severity: {p0|p1|p2|unknown}
scope: {scope-from-commit}
affected: [{file-list}]
tags: [fixdoc, {scope}]
status: resolved
---

# {title}

## 问题现象
## 根因分析
## 解决方案
## 影响面评估
### 用户影响
### 数据影响
### 性能影响
### 兼容性
## 变更文件清单
## 验证方式
## 回滚方案
## 预防与后续
```

**Obsidian 版差异**（生成时自动追加）：
- frontmatter 增加 `title`、`project`
- 正文末尾增加 `## 相关链接` 与 `[[wikilink]]`
- tags 便于 Dataview 查询

**验收标准**：
- [ ] 生成文档包含全部必需章节（minor 模式可省略部分）
- [ ] frontmatter 字段可被 YAML 解析
- [ ] 敏感信息（token、密码）在 prompt 中要求 Claude 脱敏

---

### 5.8 知识库索引（FR-08）

**需求**：`fixdoc/knowledge/INDEX.md` 维护可浏览的案例表。

**格式**：
```markdown
# Fixdoc 案例索引

| 日期 | 主题 | Scope | Commit | 文件 |
|------|------|-------|--------|------|
| 2026-05-21 | Token refresh race | auth | abc1234 | [cases/2026-05-21-auth-token-race.md](cases/2026-05-21-auth-token-race.md) |
```

**验收标准**：
- [ ] 每次 confirm 自动追加一行
- [ ] INDEX.md 提交到 Git

---

## 6. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | post-commit hook < 50ms；generate 取决于 Claude，无额外阻塞 commit |
| 可靠性 | queue 持久化；generate 失败保留 pending 状态可重试 |
| 安全 | API key 不入库；config 不含密钥；prompt 要求脱敏 |
| 可移植性 | macOS / Linux；依赖 git、node 或 bun、claude CLI |
| 可维护性 | 核心逻辑与 LLM 适配器分离；Phase 2 可加 openai/anthropic API adapter |
| 兼容性 | 不修改 Git 历史；hooks 可卸载（移除 core.hooksPath） |

---

## 7. 系统架构（Phase 1）

```
┌─────────────────────────────────────────────────────────┐
│                     开发者终端                            │
│  git commit → fixdoc generate → fixdoc confirm          │
└──────────────┬──────────────────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │  .githooks/         │
    │  post-commit        │──► fixdoc/queue/pending.jsonl
    └──────────┬──────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │  fixdoc CLI                                    │
    │  ├── collect (git show)                        │
    │  ├── prompt (prompt.md + template.md)          │
    │  ├── llm/claude-cli (claude -p)                │
    │  └── writer (draft → cases + Obsidian)         │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────┐     ┌─────────────────────┐
    │ fixdoc/knowledge/   │     │ Obsidian vault       │
    │ cases/ (Git)        │     │ (用户配置路径)        │
    │ draft/              │     └─────────────────────┘
    │ INDEX.md            │
    └─────────────────────┘
```

**目录结构（Phase 1 交付物）**：

```
fixdoc/
├── config.yaml              # 用户配置（obsidian_vault 等）
├── config.example.yaml      # 示例，入库
├── prompt.md                # LLM 系统指令
├── template.md              # 输出结构
├── package.json             # CLI 入口
├── bin/fixdoc               # 可执行入口
├── lib/
│   ├── collect.js
│   ├── config.js
│   ├── llm/
│   │   └── claude-cli.js
│   ├── queue.js
│   ├── writer.js
│   └── trigger.js
├── knowledge/
│   ├── INDEX.md
│   ├── cases/               # 入库 Git
│   └── draft/               # 草稿，confirm 前可 gitignore 或入库
└── queue/
    └── pending.jsonl        # gitignore

.githooks/
├── post-commit
└── README.md                # 安装说明

docs/
└── PRD.md                   # 本文档
```

---

## 8. LLM 集成规格（Claude CLI）

### 8.1 调用方式

Phase 1 默认通过 Claude Code CLI 非交互模式：

```bash
claude -p "$(cat assembled-prompt.txt)"
# 或
echo "$user_prompt" | claude --system-prompt-file fixdoc/prompt.md -p
```

### 8.2 认证

- 使用 Claude CLI 已有认证（OAuth / `ANTHROPIC_API_KEY`）
- Fixdoc **不管理** API key，仅调用 `claude` 二进制

### 8.3 错误处理

| 错误 | 行为 |
|------|------|
| `claude` 未安装 | 退出码 1，提示 `brew install claude-code` 或官方安装方式 |
| 认证失败 | 提示运行 `claude` 完成登录 |
| 超时（>120s） | 可配置 timeout，保留 queue pending |
| 输出非 Markdown | 尽力解析；无法解析时保存 raw 到 draft 并 warn |

### 8.4 Phase 2 扩展（不在 Phase 1 实现）

```yaml
llm:
  provider: anthropic-api | openai | ollama
```

---

## 9. 验收标准（Phase 1 整体验收）

### 9.1 功能验收

- [ ] **T1** 执行 `fixdoc(auth):` commit 后 queue 有记录
- [ ] **T2** `fixdoc generate` 调用 Claude 成功产出 draft
- [ ] **T3** `fixdoc confirm` 后 cases 文件存在且结构符合 template
- [ ] **T4** 配置 obsidian_vault 后 Obsidian 文件正确写入
- [ ] **T5** INDEX.md 自动更新
- [ ] **T6** `fixdoc status` 状态正确
- [ ] **T7** 普通 `fix:` commit 不触发任何 fixdoc 行为

### 9.2 配置验收

- [ ] **C1** 修改 obsidian_vault 后输出路径变化
- [ ] **C2** vault 为空时跳过 Obsidian 并提示
- [ ] **C3** require_draft_review=true 时 generate 不写 cases

### 9.3 文档验收

- [ ] **D1** README 含安装、配置、使用说明
- [ ] **D2** config.example.yaml 含注释说明每项

---

## 10. 路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Phase 1 MVP** | CLI + post-commit + Claude CLI + draft review + 双写 | **当前** |
| Phase 1.5 | prepare-commit-msg 模板 + `git fixdoc` alias | 待定 |
| Phase 2 | daemon 自动消费 queue + domain 分类 + 历史关联 | 待定 |
| Phase 2+ | Cursor / Claude Code IDE 薄适配 | 明确不做于 Phase 1 |
| Phase 3 | Obsidian Git 联动 + 试点指标 | 待定 |

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Claude CLI 输出不稳定 | 文档格式错乱 | template 约束 + draft review |
| 开发者忘记 confirm | draft 堆积 | status 命令 + 终端醒目提示 |
| Obsidian 路径配错 | 写文件失败 | confirm 时校验路径存在 |
| diff 过大 | token 超限 | 摘要策略 + max_lines 截断 |
| cases 含敏感信息 | 泄露 | prompt 脱敏 + review 把关 |

---

## 12. 成功指标（试点建议）

| 指标 | 基线 | Phase 1 目标 |
|------|------|--------------|
| fixdoc commit 文档覆盖率 | ~20% | ≥ 80% |
| 从 commit 到 confirm 耗时 | — | < 10 分钟（含 review） |
| AI 草稿一次通过率 | — | ≥ 60%（无需大改） |
| Obsidian 文档可被检索 | — | 100% 写入配置 vault |

---

## 13. 附录

### A. 命令速查

```bash
# 安装 hooks
git config core.hooksPath .githooks

# 配置（复制示例后编辑 obsidian_vault）
cp fixdoc/config.example.yaml fixdoc/config.yaml

# 工作流
git commit -m "fixdoc(auth): fix token race"
fixdoc generate
fixdoc confirm --latest
git add fixdoc/knowledge && git commit -m "docs: add fixdoc case auth token race"
```

### B. 参考文档

- 脑暴记录：`/Users/joji/.qoderwork/workspace/mpf8qsbarr1qvrew/outputs/git-hook-brainstorm.md`
- 技术方案：Cursor plan `postmortem_commit_hook_40549ac0.plan.md`

### C. 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-05-21 | 初版；确认 Claude CLI、draft review、Obsidian 可配置、无 Cursor |
