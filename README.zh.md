# Fixdoc

[English](./README.md) | **中文**

当你提交时使用 `fixdoc:`（或 `hotfix:` /
`#autodoc`），Fixdoc 会把该提交加入队列；运行 `fixdoc generate` 时会调用
Claude CLI 基于 diff 起草一份结构化的复盘文档；人工审核后，`fixdoc confirm`
会把它归档到项目知识库 **以及** 你的 Obsidian 仓库。

Phase 1 MVP —— 完整规格见 `docs/PRD.md`。

## 环境要求

- Node.js ≥ 18
- Git
- [Claude Code CLI](https://docs.anthropic.com/) 已加入 `PATH`，名称为 `claude`
  - 已完成认证（先交互式运行一次 `claude`，或设置 `ANTHROPIC_API_KEY`）
- Obsidian 仓库（可选）

## 安装

### 1. 安装 fixdoc

```bash
npm install -g fixdoc
```

验证：执行 `fixdoc help` 应当输出用法说明。

<details>
<summary>其他安装方式（源码安装）</summary>

```bash
# 在本仓库克隆目录下
npm link            # 把 `fixdoc` 暴露到 PATH
# 或使用安装脚本：FIXDOC_SRC=$PWD bash install.sh
# 或直接调用：    node fixdoc/bin/fixdoc.js ...
```
</details>

### 2. 在其他项目中启用 fixdoc

进入你想启用 fixdoc 的任意 git 项目：

```bash
cd path/to/your-project
fixdoc init
# 编辑 fixdoc/config.yaml —— 把 output.obsidian_vault 设为你的 Obsidian 仓库路径
```

`fixdoc init` 会写入 post-commit 钩子，生成
`fixdoc/{config.yaml,prompt.md,template.md,knowledge/,queue/}` 目录结构，
向 `.gitignore` 追加相应条目，并执行 `git config core.hooksPath .githooks`。
若需要覆盖，加 `--force` 重新运行（你的 `config.yaml` 始终会被保留）。

> 不要手动 `cp fixdoc/config.example.yaml ...` —— 这个路径只在 fixdoc 仓库内部存在，
> 在目标项目里没有。请使用 `fixdoc init`。

## 工作流

```bash
git commit -m "fixdoc(auth): fix token refresh race" \
           -m "## 问题现象\nIntermittent 401 after token rotation..."
# post-commit 钩子会把该 SHA 写入 fixdoc/queue/pending.jsonl

fixdoc status
fixdoc generate              # 通过 Claude CLI 根据 diff 起草
# 审核 fixdoc/knowledge/draft/<file>.md，按需修改

fixdoc confirm --latest      # 归档到 cases/ + Obsidian，更新 INDEX.md
git add fixdoc/knowledge && git commit -m "docs: fixdoc case auth token race"
```

## 命令

| 命令 | 说明 |
|------|------|
| `fixdoc init` | 在当前 git 项目中生成 fixdoc 目录与钩子 |
| `fixdoc generate` | 起草队列中的下一个待处理条目 |
| `fixdoc generate --sha <sha>` | 起草指定的提交 |
| `fixdoc generate --all` | 起草所有待处理条目 |
| `fixdoc confirm <draft.md>` | 归档已审核的草稿 |
| `fixdoc confirm --latest` | 归档最新的草稿 |
| `fixdoc status` | 查看队列与待审核草稿 |

## 触发规则

| 模式 | 是否触发 |
|------|---------|
| 首行 `fixdoc(...)?: ...` | 是 |
| 首行 `hotfix(...)?: ...` | 是 |
| 任意位置出现 `#autodoc` | 是 |
| `fix:` / `feat:` 等 | 否 |

提交正文中的严重程度标签会影响文档详尽程度：

- `#autodoc-urgent` → 完整文档
- `#autodoc-minor` → 精简
- （无）→ 标准

## 配置

见 `fixdoc/config.example.yaml`。关键字段：

- `output.obsidian_vault` —— Obsidian 仓库的绝对路径。留空 `""`
  则跳过 Obsidian 写入（仅写 cases）。
- `output.obsidian_subdir` —— 仓库内用于存放这些笔记的子目录。
- `llm.command` —— 如有需要，覆盖 Claude CLI 可执行文件路径。
- `diff.max_lines` —— 注入 prompt 的 diff 截断阈值。

## 目录结构

```
fixdoc/
├── bin/fixdoc.js            # CLI 入口
├── lib/                     # collect, prompt, llm, queue, writer, trigger, config
├── prompt.md                # LLM 系统指令
├── template.md              # 输出结构
├── config.example.yaml
├── knowledge/
│   ├── INDEX.md             # 自动维护
│   ├── cases/               # 入库
│   └── draft/               # gitignore，等待 confirm
└── queue/pending.jsonl      # gitignore
.githooks/post-commit        # 失败即放行的入队钩子
```

## 故障排查

- `claude: command not found` —— 安装 Claude Code CLI 并确认它在 `PATH`，
  或在 `fixdoc/config.yaml` 中设置 `llm.command`。
- Claude 认证失败 —— 交互式运行 `claude` 完成登录，或设置
  `ANTHROPIC_API_KEY`。
- 钩子未触发 —— 确认 `git config core.hooksPath` 返回 `.githooks`。
- Obsidian 没有写入 —— 把 `output.obsidian_vault` 设为存在的绝对路径。
  路径缺失时 `fixdoc status` 会给出警告。

## 卸载

```bash
git config --unset core.hooksPath
```
