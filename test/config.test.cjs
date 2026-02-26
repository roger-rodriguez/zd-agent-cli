const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { normalizeAgentPath, resolveQueueInput, loadResolvedConfig } = require('../dist/core/config.js');

test('normalizeAgentPath enforces leading slash', () => {
  assert.equal(normalizeAgentPath('agent/filters/1'), '/agent/filters/1');
  assert.equal(normalizeAgentPath('/agent/filters/1'), '/agent/filters/1');
});

test('resolveQueueInput resolves alias and path', () => {
  const out = resolveQueueInput('support-open', {
    defaultQueue: 'support-open',
    queues: {
      'support-open': { path: '/agent/filters/123', team: 'support' }
    }
  });

  assert.equal(out.alias, 'support-open');
  assert.equal(out.queuePath, '/agent/filters/123');
  assert.equal(out.team, 'support');
});

test('resolveQueueInput uses default alias when omitted', () => {
  const out = resolveQueueInput('', {
    defaultQueue: 'support-open',
    queues: {
      'support-open': { path: '/agent/filters/123', team: 'support' }
    }
  });

  assert.equal(out.alias, 'support-open');
  assert.equal(out.queuePath, '/agent/filters/123');
});

test('loadResolvedConfig falls back to package-root config for npm-link workflows', () => {
  const pkgRoot = path.resolve(__dirname, '..');
  const cfgPath = path.join(pkgRoot, 'zendesk.config.json');
  const existing = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : null;

  fs.writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        domain: 'linked.zendesk.com',
        startPath: '/agent/filters/999',
        defaultQueue: 'linked-queue',
        queues: {
          'linked-queue': { path: '/agent/filters/999', team: 'linked' }
        }
      },
      null,
      2
    )
  );

  try {
    const resolved = loadResolvedConfig({
      cwd: '/tmp'
    });
    assert.equal(resolved.configPath, cfgPath);
    assert.equal(resolved.repoRoot, pkgRoot);
    assert.equal(resolved.queueConfig.defaultQueue, 'linked-queue');
    assert.equal(resolved.queueConfig.queues['linked-queue'].path, '/agent/filters/999');
  } finally {
    if (existing === null) {
      fs.rmSync(cfgPath, { force: true });
    } else {
      fs.writeFileSync(cfgPath, existing);
    }
  }
});
