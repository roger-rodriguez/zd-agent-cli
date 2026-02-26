const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function run(args, cwd, env = {}) {
  return execFileSync('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('queue list returns configured aliases as json', () => {
  const repo = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zagent-test-'));
  const configPath = path.join(tmp, 'zendesk.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        domain: 'example.zendesk.com',
        startPath: '/agent/filters/1',
        defaultQueue: 'support-open',
        queues: {
          'support-open': { path: '/agent/filters/1', team: 'support' },
          'support-all': { path: '/agent/filters/2', team: 'support' }
        }
      },
      null,
      2
    )
  );

  const out = run(['--config', configPath, '--json', 'queue', 'list'], repo);
  const parsed = JSON.parse(out);
  assert.equal(parsed.command, 'list-queues');
  assert.equal(parsed.defaultQueue, 'support-open');
  assert.equal(parsed.count, 2);
});

test('auth check returns structured JSON without requiring live CDP', () => {
  const repo = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zagent-test-'));
  const configPath = path.join(tmp, 'zendesk.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        domain: 'example.zendesk.com',
        startPath: '/agent/filters/1',
        defaultQueue: 'support-open',
        queues: {
          'support-open': { path: '/agent/filters/1', team: 'support' }
        }
      },
      null,
      2
    )
  );

  const out = run(['--config', configPath, '--json', 'auth', 'check'], repo);
  const parsed = JSON.parse(out);
  assert.equal(parsed.command, 'auth-check');
  assert.equal(typeof parsed.cdp.reachable, 'boolean');
  assert.equal(typeof parsed.config.ok, 'boolean');
});
