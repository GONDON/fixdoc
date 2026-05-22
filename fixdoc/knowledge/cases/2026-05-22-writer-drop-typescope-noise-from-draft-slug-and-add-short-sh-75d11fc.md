---
id: 75d11fc4979142986591cd7f91e15654644e2c3a
date: 2026-05-22
type: bugfix
severity: p2
scope: writer
affected: [fixdoc/lib/writer.js]
tags: [fixdoc]
status: resolved
---

# fixdoc(writer): drop type(scope) noise from draft slug and add short SHA suffix

## 问题现象

`fixdoc generate` 产出的 draft 文件名包含了 commit type 前缀噪音，形如：

```
2026-05-22-test-fixdoctest-test-generate.md
```

可见 `fixdoc`、`test` 等 type/scope 片段被混入 slug。此外，当两个 fixdoc commit 的主题（subject）相同时，第二次 `generate` 会产生完全相同的文件名，从而**静默覆盖**前一次生成的 draft，没有任何告警。

## 根因分析

`fixdoc/lib/writer.js` 中存在两处缺陷：

1. `buildSlug(ctx, info)` 直接使用 `ctx.subject` 作为 slug 基底。`ctx.subject` 是 commit 第一行原文，仍带有 `type(scope):` 前缀（如 `fixdoc(writer): ...`）。而 `trigger.classify` 已经返回过清洗后的 `info.subject`，但 writer 没有使用它。
2. `draftFilename(ctx, info)` 仅由 `日期 + slug` 组成，缺少能区分同主题 commit 的唯一标识，因此两次相同 subject 的 commit 会落到同一文件路径，产生覆盖。

根因是 writer 层与 trigger 层的契约未对齐——writer 重新解析了已经在上游清洗过的字段，并且唯一性假设错误地依赖了主题文本。

## 解决方案

在 `fixdoc/lib/writer.js` 中做两处最小修复：

- `buildSlug` 优先使用 `info.subject`（已由 `trigger.classify` 去除 `type(scope):` 前缀），仅在缺失时 fallback 到 `ctx.subject`：
  ```js
  const subj = (info && info.subject) || ctx.subject;
  const base = info && info.scope ? `${info.scope}-${subj}` : subj;
  ```
- `draftFilename` 在末尾追加 7 位 short SHA 后缀，保证文件名唯一：
  ```js
  return `${dateOnly(ctx.date)}-${buildSlug(ctx, info)}-${ctx.shortSha}.md`;
  ```

前者解决 slug 噪音，后者从结构上消除主题碰撞导致的覆盖问题（即使 slug 完全相同，SHA 也不同）。

## 影响面评估

### 用户影响

仅影响 fixdoc 工具的本地使用者：新生成的 draft 文件名更清晰，且不会再被同主题 commit 覆盖。历史已生成的 draft 文件名不会被改动。

### 数据影响

无数据迁移。已存在的旧 draft 文件保留原名；新文件采用新命名格式，两者可共存。

### 性能影响

无。仅字符串处理路径变化，开销可忽略。

### 兼容性

draft 文件名格式由 `{date}-{slug}.md` 变为 `{date}-{slug}-{shortSha}.md`。任何依赖固定文件名模式（如外部脚本按精确名查找 draft）的下游消费者需要相应更新匹配规则。从 diff 看仓库内无此类消费者。新增对 `ctx.shortSha` 的依赖——需上游 ctx 构造方提供此字段（未在本 diff 中可见，作者应确认 `ctx.shortSha` 已被填充；否则文件名末尾会出现 `undefined`）。

## 变更文件清单

- `fixdoc/lib/writer.js`
  - `buildSlug`：改用 `info.subject` 作为 slug 基底
  - `draftFilename`：在文件名末尾追加 short SHA 后缀

## 验证方式

从本 diff 不可见自动化测试改动 —— 作者应补充。建议验证：

- 用一个 `fixdoc(writer): some subject` commit 触发 `generate`，确认输出文件名形如 `2026-05-22-writer-some-subject-<7位sha>.md`，不再出现 `fixdoc`/`writer-fixdoc` 类噪音前缀。
- 用两个 subject 完全相同的 fixdoc commit 连续触发 `generate`，确认产生两个不同文件（SHA 后缀不同），无覆盖。
- 验证 `ctx.shortSha` 在 writer 调用处确实被赋值，避免出现 `-undefined.md`。

## 回滚方案

变更范围仅限单文件 `fixdoc/lib/writer.js`，可通过 `git revert 75d11fc` 安全回滚。回滚后已生成的新格式 draft 文件不会被自动改名，但不影响工具继续工作（仅恢复旧的覆盖行为与噪音 slug）。

## 预防与后续

- 补充针对 `buildSlug` / `draftFilename` 的单元测试，覆盖：含 `type(scope):` 前缀的 subject、相同 subject 的两次生成、缺失 `info.subject` 的 fallback 路径。
- 在 `ctx` 构造处对 `shortSha` 做断言或默认值，避免上游遗漏导致 `undefined` 出现在文件名里。
- 考虑在 writer 层用类型/Schema 明确 `ctx` 与 `info` 的契约，防止类似"重新解析上游已清洗字段"的回归再次发生。