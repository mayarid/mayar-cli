const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const skill = require('../src/commands/skill');

describe('skill install', () => {
  test('builds the official installer command', () => {
    assert.deepEqual(skill.installArgs({ target: 'claude' }),
      ['-y', 'skills', 'add', 'mayarid/skills', '--skill', 'mayar-v2', '-y', '-a', 'claude-code']);
    assert.deepEqual(skill.installArgs({ target: 'all', global: true }).slice(7),
      ['-a', 'claude-code', '-a', 'codex', '-a', 'cursor', '-a', 'opencode', '-g']);
    assert.throws(() => skill.installArgs({ target: 'vim' }), /Invalid --target "vim"/);
  });

  test('runs the installer and reports failure', async () => {
    const w = process.stdout.write;
    process.stdout.write = () => true;
    let seen;
    try {
      await skill.run({ flags: { target: 'cursor' }, positional: ['install'] }, { exec: async (args) => { seen = args; return { code: 0, output: '' }; } });
      await assert.rejects(
        skill.run({ flags: {}, positional: ['install'] }, { exec: async () => ({ code: 2, output: '' }) }),
        /skills installer failed \(exit code 2\)/,
      );
    } finally { process.stdout.write = w; }
    assert.deepEqual(seen.slice(-2), ['-a', 'cursor']);
  });
});
