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
