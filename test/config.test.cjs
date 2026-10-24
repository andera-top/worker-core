const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function loadConfig(overrides = {}) {
  return spawnSync(process.execPath, ['-e', "require('./dist/config')"], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, AUTH_KEY: 'worker-key', LB_AUTH_KEY: 'lb-key', GROUP: 'test', ...overrides },
    encoding: 'utf8',
  })
}

test('invalid numeric Worker configuration fails fast', () => {
  assert.equal(loadConfig({ CONTRACT: '1.5' }).status, 1)
  assert.equal(loadConfig({ SLOTS: '0' }).status, 1)
  assert.equal(loadConfig({ WEBHOOK_MAX_RETRIES: '-1' }).status, 1)
  assert.equal(loadConfig({ WEBHOOK_HEADERS: '[]' }).status, 1)
  assert.equal(loadConfig({ WEBHOOK_HEADERS: '{"Authorization":42}' }).status, 1)
  assert.equal(loadConfig({ LOG_LEVEL: 'verbose' }).status, 1)
  assert.equal(loadConfig({ LB_AUTH_KEY: 'worker-key' }).status, 1)
  // Node fires larger timer delays after 1 ms.
  assert.equal(loadConfig({ DEFAULT_TIMEOUT: '3000000000' }).status, 1)
  assert.equal(loadConfig({ REQUEST_BODY_LIMIT: '10 megs' }).status, 1)
  assert.equal(loadConfig({ REQUEST_BODY_LIMIT: '0mb' }).status, 1)
  assert.equal(loadConfig({ REQUEST_BODY_LIMIT: '512kb' }).status, 0)
  const malformed = loadConfig({ WEBHOOK_HEADERS: '{"Authorization": "Bearer s3cr3t"' })
  assert.equal(malformed.status, 1)
  assert.doesNotMatch(malformed.stderr, /s3cr3t/, 'Parser errors must not echo secrets')
  assert.equal(loadConfig().status, 0)
})
