# Fixdoc

**English** | [中文](./README.zh.md)

Vendor-agnostic Git workflow tool: when you commit with `fixdoc:` (or
`hotfix:` / `#autodoc`), Fixdoc enqueues the commit; running `fixdoc generate`
asks Claude CLI to draft a structured postmortem from the diff; after manual
review, `fixdoc confirm` archives it into the project knowledge base **and**
your Obsidian vault.

Phase 1 MVP — see `docs/PRD.md` for the full spec.

## Requirements

- Node.js ≥ 18
- Git
- [Claude Code CLI](https://docs.anthropic.com/) on `PATH` as `claude`
  - Authenticated (run `claude` once interactively, or set `ANTHROPIC_API_KEY`)
- Obsidian vault (optional)

## Install

### 1. Install fixdoc itself (once per machine)

```bash
npm install -g fixdoc
```

Verify: `fixdoc help` should print the usage.

<details>
<summary>Alternatives (from source)</summary>

```bash
# inside a clone of this repo
npm link            # exposes `fixdoc` on PATH
# or use the installer: FIXDOC_SRC=$PWD bash install.sh
# or invoke directly:   node fixdoc/bin/fixdoc.js ...
```
</details>

### 2. Enable fixdoc in another project

In any git project where you want fixdoc:

```bash
cd path/to/your-project
fixdoc init
# edit fixdoc/config.yaml — set output.obsidian_vault to your vault path
```

`fixdoc init` writes the post-commit hook, scaffolds `fixdoc/{config.yaml,prompt.md,template.md,knowledge/,queue/}`, appends the right entries to `.gitignore`, and runs `git config core.hooksPath .githooks`. Re-run with `--force` to overwrite (your `config.yaml` is always kept).

> Don't `cp fixdoc/config.example.yaml ...` manually — that path only exists inside the fixdoc repo, not in target projects. Use `fixdoc init`.

## Workflow

```bash
git commit -m "fixdoc(auth): fix token refresh race" \
           -m "## 问题现象\nIntermittent 401 after token rotation..."
# post-commit hook adds the SHA to fixdoc/queue/pending.jsonl

fixdoc status
fixdoc generate              # uses Claude CLI to draft from the diff
# review fixdoc/knowledge/draft/<file>.md, edit if needed

fixdoc confirm --latest      # archives to cases/ + Obsidian, updates INDEX.md
git add fixdoc/knowledge && git commit -m "docs: fixdoc case auth token race"
```

## Commands

| Command | Description |
|---------|-------------|
| `fixdoc init` | Scaffold fixdoc files + hook in the current git project |
| `fixdoc generate` | Draft the next pending queue entry |
| `fixdoc generate --sha <sha>` | Draft a specific commit |
| `fixdoc generate --all` | Draft every pending entry |
| `fixdoc confirm <draft.md>` | Archive a reviewed draft |
| `fixdoc confirm --latest` | Archive the most recent draft |
| `fixdoc status` | Show queue + drafts awaiting review |

## Trigger rules

| Pattern | Trigger |
|---------|---------|
| `fixdoc(...)?: ...` first line | yes |
| `hotfix(...)?: ...` first line | yes |
| `#autodoc` anywhere | yes |
| `fix:` / `feat:` / etc. | no |

Severity tags inside the commit body refine the document depth:

- `#autodoc-urgent` → full document
- `#autodoc-minor` → trimmed
- (none) → standard

## Configuration

See `fixdoc/config.example.yaml`. Key fields:

- `output.obsidian_vault` — absolute path to your Obsidian vault. Leave `""`
  to skip Obsidian write (cases-only).
- `output.obsidian_subdir` — directory inside the vault for these notes.
- `llm.command` — override the Claude CLI binary path if needed.
- `diff.max_lines` — diff truncation threshold for the prompt.

## Layout

```
fixdoc/
├── bin/fixdoc.js            # CLI entry
├── lib/                     # collect, prompt, llm, queue, writer, trigger, config
├── prompt.md                # LLM system instructions
├── template.md              # output structure
├── config.example.yaml
├── knowledge/
│   ├── INDEX.md             # auto-maintained
│   ├── cases/               # committed
│   └── draft/               # gitignored, awaiting confirm
└── queue/pending.jsonl      # gitignored
.githooks/post-commit        # fail-open enqueuer
```

## Troubleshooting

- `claude: command not found` — install Claude Code CLI and ensure it is on
  `PATH`, or set `llm.command` in `fixdoc/config.yaml`.
- Auth failure from Claude — run `claude` interactively to log in, or set
  `ANTHROPIC_API_KEY`.
- Hook not firing — check `git config core.hooksPath` returns `.githooks`.
- Empty Obsidian write — set `output.obsidian_vault` to an existing absolute
  path. `fixdoc status` warns if the path is missing.

## Uninstall

```bash
git config --unset core.hooksPath
```
