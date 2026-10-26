const { test } = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { AUTH_KEY: 'worker-key', LB_AUTH_KEY: 'lb-key', GROUP: 'test' })
const { executeFunction } = require('../dist/dynamic/functionRunner')
const { inputSchema } = require('../dist/mcp/schema')
const { AjvJsonSchemaValidator } = require('@modelcontextprotocol/sdk/validation/ajv-provider.js')

test('REST parameter semantics agree with MCP for Unicode, object enums and inherited properties', async () => {
  const params = { value: { type: 'string', min: 2 } }
  const def = { params, handler: async value => value }
  assert.equal(new AjvJsonSchemaValidator().getValidator(inputSchema(params))({ value: '😀' }).valid, false)
  await assert.rejects(executeFunction(def, { value: '😀' }), /Length/)
  const result = await executeFunction({ params: { toString: { type: 'string', default: 'fallback' } }, handler: async args => args }, {})
  assert.equal(result.toString, 'fallback')
  const objectEnum = { value: { type: 'object', enum: [{ ok: true }] } }
  assert.equal(new AjvJsonSchemaValidator().getValidator(inputSchema(objectEnum))({ value: { ok: true } }).valid, true)
  assert.deepEqual((await executeFunction({ params: objectEnum, handler: async args => args }, { value: { ok: true } })).value, { ok: true })
  const defaults = {
    params: { value: { type: 'array', default: [] } },
    handler: async args => {
      args.value.push('x')
      return args.value.length
    },
  }
  assert.equal(await executeFunction(defaults, {}), 1)
  assert.equal(await executeFunction(defaults, {}), 1, 'Handlers must not mutate defaults shared with later calls')
})

test('functions without params accept empty input and expose an empty schema', async () => {
  assert.deepEqual(await executeFunction({ handler: async args => ({ ...args }) }, undefined), {})
  assert.deepEqual(
    { ...inputSchema(undefined), properties: { ...inputSchema(undefined).properties } },
    { type: 'object', properties: {}, required: [], additionalProperties: false }
  )
})

test('logged errors keep their message but never their serialized request details', () => {
  const { log, getLogs } = require('../dist/utils/logger')
  const err = Object.assign(new Error('Request failed'), { code: 'ECONNREFUSED', toJSON: () => ({ headers: { Authorization: 'Bearer s3cr3t' } }) })
  log('[TEST]', err)
  const line = getLogs().at(-1)
  assert.match(line, /Error: Request failed \(ECONNREFUSED\)/)
  assert.doesNotMatch(line, /s3cr3t/)
})

test('invalid function settings stop loading instead of failing every call', async () => {
  const fs = require('node:fs/promises')
  const path = require('node:path')
  const os = require('node:os')
  const { resolveFunctions } = require('../dist/dynamic/resolveFunctions')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'andera-functions-'))
  // Node caches imported modules, so each case uses its own directory and file.
  const load = async (name, config) => {
    const caseDir = await fs.mkdtemp(path.join(dir, 'case-'))
    await fs.writeFile(path.join(caseDir, name + '.js'), `exports.${name} = { config: ${JSON.stringify(config)}, handler: async () => 1 }`)
    return resolveFunctions(caseDir)
  }
  try {
    await assert.rejects(load('slow', { timeout: 3000000000 }), /Invalid config for function 'slow': Function timeout must be an integer/)
    await assert.rejects(load('flaky', { maxRetries: -1 }), /Invalid config for function 'flaky': Function maxRetries/)
    assert.deepEqual((await load('valid', { timeout: 1000, maxRetries: 1 })).get('valid').params, {})
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
