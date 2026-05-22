'use strict';

// Claude CLI adapter — Phase 1 default LLM provider.
// Sends the assembled prompt via stdin to `claude -p` (non-interactive).

const { spawnSync } = require('child_process');

function generate(prompt, cfg) {
  const llm = cfg.llm || {};
  const cmd = llm.command || 'claude';
  const args = Array.isArray(llm.args) ? llm.args.slice() : ['-p'];
  const timeout = llm.timeout_ms || 120000;

  const result = spawnSync(cmd, args, {
    input: prompt,
    encoding: 'utf8',
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        `Claude CLI not found (\`${cmd}\`). Install via official Anthropic instructions, or override llm.command in fixdoc/config.yaml.`
      );
    }
    if (result.error.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      throw new Error(`Claude CLI timed out after ${timeout}ms (llm.timeout_ms).`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    let hint = '';
    if (/auth|login|unauthor/i.test(stderr)) {
      hint = ' — run `claude` interactively to complete login, or set ANTHROPIC_API_KEY.';
    }
    throw new Error(`Claude CLI exited ${result.status}: ${stderr || '(no stderr)'}${hint}`);
  }

  return (result.stdout || '').trim();
}

module.exports = { generate };
