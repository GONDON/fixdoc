# Git hooks for fixdoc

Activate once per clone:

```bash
git config core.hooksPath .githooks
```

`post-commit` will detect `fixdoc:` / `hotfix:` / `#autodoc` commits and append
a pending entry to `fixdoc/queue/pending.jsonl`. It fails open — a hook error
will never block your commit.

To uninstall: `git config --unset core.hooksPath`.
