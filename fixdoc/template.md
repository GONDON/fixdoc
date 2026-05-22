---
id: {commit-sha}
date: {commit-date}
type: bugfix
severity: unknown
scope: {scope-from-commit}
affected: []
tags: [fixdoc]
status: resolved
---

# {title}

## 问题现象

{What was observed — symptoms, error messages, reproduction trigger.}

## 根因分析

{Why it happened — the underlying cause, not just the surface symptom.}

## 解决方案

{What changed and why this fix addresses the root cause. Reference key files / functions.}

## 影响面评估

### 用户影响

{Who was affected and how. "None observed" is acceptable if true.}

### 数据影响

{Any data corruption, migration, or backfill needed.}

### 性能影响

{Latency, throughput, or resource changes.}

### 兼容性

{API / schema / config compatibility notes.}

## 变更文件清单

{Bullet list of files touched, grouped if helpful.}

## 验证方式

{How the fix was validated — tests added, manual repro, monitoring signal.}

## 回滚方案

{How to revert safely if regression appears.}

## 预防与后续

{Tests, alerts, refactors, or follow-up tickets to prevent recurrence.}
