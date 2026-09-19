const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('public service helpers operate on the services loaded by bootstrap', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'andera-services-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(
    path.join(root, 'example.js'),
    `exports.example = { start: async () => {}, status: async () => ({ up: true }), stop: async () => { global.stopped = true } }`
  )
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    (async () => {
      const api = require('./dist')
      await api.resolveServices(process.env.TEST_SERVICES_DIR)
      const tags = await api.getServiceTags()
      await api.stopAllServices()
      if (tags.example?.up !== true || global.stopped !== true) process.exit(1)
      process.exit(0)
    })().catch(() => process.exit(1))
  `,
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, AUTH_KEY: 'worker', LB_AUTH_KEY: 'balancer', GROUP: 'test', LOG_LEVEL: 'error', TEST_SERVICES_DIR: root },
      timeout: 5000,
      encoding: 'utf8',
    }
  )
  assert.equal(result.status, 0, result.stderr)
})
