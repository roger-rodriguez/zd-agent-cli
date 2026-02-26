const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readCachedTicket } = require('../dist/core/storage.js');
const { writeJson } = require('../dist/core/util.js');

test('readCachedTicket returns fresh cached ticket within ttl', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zagent-cache-test-'));
  const latestPath = path.join(root, 'tickets', '1234', 'latest.json');
  writeJson(latestPath, {
    command: 'read-ticket',
    ticketId: '1234',
    subject: 'Cached',
    capturedAt: new Date().toISOString()
  });

  const hit = readCachedTicket({
    storeRoot: root,
    ticketId: '1234',
    ttlSeconds: 120
  });

  assert.equal(Boolean(hit), true);
  assert.equal(hit.cacheHit, true);
  assert.equal(hit.ticketId, '1234');
});

test('readCachedTicket returns null when cached item is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zagent-cache-test-'));
  const latestPath = path.join(root, 'tickets', '1234', 'latest.json');
  writeJson(latestPath, {
    command: 'read-ticket',
    ticketId: '1234',
    subject: 'Stale',
    capturedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  });

  const hit = readCachedTicket({
    storeRoot: root,
    ticketId: '1234',
    ttlSeconds: 120
  });

  assert.equal(hit, null);
});
