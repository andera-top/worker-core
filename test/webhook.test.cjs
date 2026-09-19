const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
Object.assign(process.env, { AUTH_KEY: 'worker', LB_AUTH_KEY: 'balancer', GROUP: 'test', LOG_LEVEL: 'error', WEBHOOK_MAX_RETRIES: '0' })
const { sendWebhook } = require('../dist/utils/webhookManager')

test('webhooks do not follow redirects that could forward custom credentials', async t => {
  let leaked = false
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(307, { Location: '/target' })
      res.end()
      return
    }
    leaked = true
    res.end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  await assert.rejects(sendWebhook('http://127.0.0.1:' + server.address().port + '/redirect', {}, { 'X-Custom-Secret': 'must-not-forward' }))
  assert.equal(leaked, false)
})
