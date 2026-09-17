const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')

async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await check()) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Server readiness timed out')
}

test('actual Worker: MCP and REST share slots, auth and health stay separate', { timeout: 15000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'andera-worker-integration-'))
  await fs.mkdir(path.join(root, 'src/functions'), { recursive: true })
  await fs.mkdir(path.join(root, 'src/services'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'src/functions/hello.js'),
    `
let active = 0, maximum = 0
exports.hello = {
  description: 'Integration greeting',
  params: { name: { type: 'string', default: 'World' }, delay: { type: 'number', default: 30 } },
  config: { logResult: false, supportsStreaming: true },
  handler: async (args, context) => {
    active++; maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, args.delay))
    active--
    if (args.name === 'Secret failure') throw new Error('sensitive implementation detail')
    if (context?.stream) { context.stream('first'); context.stream('second') }
    return { greeting: args.name, maximum }
  }
}
`
  )
  await fs.writeFile(
    path.join(root, 'src/services/flaky.js'),
    `
let attempts = 0
exports.flaky = {
  config: { restartOnFailure: true },
  start: async () => { attempts++; if (attempts === 1) throw new Error('initial failure') },
  stop: async () => {}
}
`
  )
  const configFile = path.join(root, 'mcp.json')
  await fs.writeFile(configFile, JSON.stringify({ functions: ['hello'] }))
  const port = await freePort(),
    wsPort = await freePort()
  const env = {
    ...process.env,
    AUTH_KEY: 'worker-integration-key',
    LB_AUTH_KEY: 'lb-integration-key',
    MCP_AUTH_KEY: 'mcp-integration-key',
    GROUP: 'test',
    CONTRACT: '1',
    PORT: String(port),
    WEBSOCKET_PORT: String(wsPort),
    SLOTS: '1',
    LOG_LEVEL: 'error',
    MCP_CONFIG_PATH: configFile,
    OPENAPI_ENABLED: 'true',
  }
  const child = spawn(process.execPath, ['-e', `require('./dist/app').bootstrap({ port: ${port} }, ${JSON.stringify(path.join(root, 'src'))})`], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'ignore',
  })
  const client = new Client({ name: 'worker-integration', version: '1' })
  t.after(async () => {
    await client.close().catch(() => {})
    if (child.exitCode === null) {
      child.kill()
      await once(child, 'exit')
    }
    await fs.rm(root, { recursive: true, force: true })
  })
  const base = 'http://127.0.0.1:' + port
  await waitFor(async () => (await (await fetch(base + '/health')).json()).status === 'ready')
  const auth = key => ({ Authorization: 'Bearer ' + key })
  const health = async key => (await fetch(base + '/health', { headers: auth(key) })).json()
  const publicHealth = await health('')
  assert.equal(publicHealth.mcp, undefined)
  assert.equal((await health(env.MCP_AUTH_KEY)).mcp, undefined)
  const adminHealth = await health(env.AUTH_KEY)
  assert.equal(adminHealth.mcp.enabled, true)
  assert.equal(adminHealth.mcp.tools[0].name, 'hello')
  assert.equal(adminHealth.functions[0].description, 'Integration greeting')
  assert.equal(adminHealth.services[0].state, 'up')
  const openapi = await (await fetch(base + '/openapi')).json()
  const taskSchema = openapi.paths['/task'].post.requestBody.content['application/json'].schema.oneOf[0]
  assert.ok(taskSchema.required.includes('contract'))
  assert.equal(taskSchema.properties.input.properties.name.type, 'string')
  assert.equal(taskSchema.properties.name, undefined)
  assert.equal((await fetch(base + '/off', { method: 'POST', headers: auth(env.MCP_AUTH_KEY) })).status, 401)
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: auth(env.MCP_AUTH_KEY) } }))
  const tasks = await Promise.all(Array.from({ length: 3 }, (_, i) => client.callTool({ name: 'hello', arguments: { name: 'User ' + i } })))
  assert.ok(tasks.every(result => result.structuredContent.result.maximum === 1))
  const rest = async payload =>
    fetch(base + '/task', { method: 'POST', headers: { ...auth(env.AUTH_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(
    (
      await fetch(base + '/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    401
  )
  const malformed = await fetch(base + '/task', {
    method: 'POST',
    headers: { ...auth(env.AUTH_KEY), 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.deepEqual(await malformed.json(), { error: 'Invalid request' })
  assert.equal((await rest({ function: 'hello', contract: 2, input: {} })).status, 400)
  const normal = await (await rest({ function: 'hello', contract: 1, input: {} })).json()
  assert.equal(normal.result.greeting, 'World')
  const invalidInput = await rest({ function: 'hello', contract: 1, input: { unexpected: true } })
  assert.equal(invalidInput.status, 400)
  assert.match((await invalidInput.json()).error, /Unexpected param/)
  const failedRest = await rest({ function: 'hello', contract: 1, input: { name: 'Secret failure' } })
  assert.equal(failedRest.status, 500)
  assert.deepEqual(await failedRest.json(), { success: false, error: 'Function execution failed' })
  assert.equal(await (await rest({ function: 'hello', contract: 1, input: {}, mode: 'stream' })).text(), 'firstsecond')
  let webhookPayload
  const webhook = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    webhookPayload = JSON.parse(body)
    res.end('ok')
  })
  await new Promise(resolve => webhook.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => webhook.close(resolve)))
  const delivered = await rest({
    function: 'hello',
    contract: 1,
    input: { name: 'Webhook' },
    mode: 'webhook',
    webhook: { url: 'http://127.0.0.1:' + webhook.address().port },
  })
  assert.equal(delivered.status, 200)
  assert.equal(webhookPayload.greeting, 'Webhook')
  const first = rest({ function: 'hello', contract: 1, input: { name: 'First', delay: 200 } })
  await new Promise(resolve => setTimeout(resolve, 20))
  let secondSettled = false
  const second = rest({ function: 'hello', contract: 1, input: { name: 'Queued', delay: 10 } }).then(response => {
    secondSettled = true
    return response
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  await fetch(base + '/off', { method: 'POST', headers: auth(env.AUTH_KEY) })
  assert.equal((await first).status, 200)
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(secondSettled, false)
  assert.equal((await client.callTool({ name: 'hello', arguments: {} })).isError, true)
  await fetch(base + '/on', { method: 'POST', headers: auth(env.AUTH_KEY) })
  assert.equal((await second).status, 200)
  await fs.writeFile(configFile, JSON.stringify({ functions: [] }))
  assert.deepEqual((await client.listTools()).tools, [])
  assert.equal((await client.callTool({ name: 'hello', arguments: {} })).isError, true)
  // MCP settings must not alter the ordinary REST API.
  assert.equal((await rest({ function: 'hello', contract: 1, input: {} })).status, 200)
  await fs.unlink(configFile)
  assert.equal((await health(env.AUTH_KEY)).mcp.enabled, false)
})
