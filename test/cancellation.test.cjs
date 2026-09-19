const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
Object.assign(process.env, { AUTH_KEY: 'worker-key', LB_AUTH_KEY: 'lb-key', GROUP: 'test', LOG_LEVEL: 'error' })
const { executeFunction, FunctionTimeoutError, getTimedOutExecutions } = require('../dist/dynamic/functionRunner')
const { addTaskToQueue } = require('../dist/slots/taskQueue')
const { configureSlots, getUsedSlots } = require('../dist/slots/slotsManager')
const tick = () => new Promise(resolve => setImmediate(resolve))

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('timeout aborts supported operations and never retries, including cleanup', async () => {
  let calls = 0,
    signal,
    cleaned = false
  const result = executeFunction(
    {
      params: {},
      config: { timeout: 30, maxRetries: 3 },
      handler: async (_args, context) => {
        calls++
        signal = context.signal
        try {
          await delay(5000, undefined, { signal })
        } finally {
          cleaned = true
        }
      },
    },
    {},
    undefined,
    'cooperative'
  )
  await assert.rejects(result, FunctionTimeoutError)
  await tick()
  assert.equal(signal.aborted, true)
  assert.equal(cleaned, true)
  assert.equal(calls, 1)
  assert.deepEqual(getTimedOutExecutions(), [])
})

test('timed-out handlers keep slots until settlement and late rejection is consumed', async () => {
  configureSlots(1)
  const finish = deferred()
  let calls = 0,
    nextStarted = false,
    stream
  const chunks = []
  const first = addTaskToQueue(1, () =>
    executeFunction(
      {
        params: {},
        config: { timeout: 30, maxRetries: 2 },
        handler: async (_args, context) => {
          calls++
          stream = context.stream
          stream('before')
          await finish.promise
        },
      },
      {},
      { stream: chunk => chunks.push(chunk) },
      'ignoresAbort'
    )
  )
  const second = addTaskToQueue(1, async () => {
    nextStarted = true
  })
  await assert.rejects(first, FunctionTimeoutError)
  assert.equal(getUsedSlots(), 1)
  assert.equal(nextStarted, false)
  assert.equal(calls, 1)
  assert.equal(getTimedOutExecutions()[0].function, 'ignoresAbort')
  stream('after')
  assert.deepEqual(chunks, ['before'], 'Late output must never write to a completed response')
  await delay(30)
  assert.equal(nextStarted, false)
  finish.reject(new Error('late cleanup failure'))
  await second
  await tick()
  assert.equal(getUsedSlots(), 0)
  assert.deepEqual(getTimedOutExecutions(), [])
})

test('cooperative cleanup also retains its slot until finally finishes', async () => {
  configureSlots(1)
  const cleanup = deferred()
  let aborted = false
  const first = addTaskToQueue(1, () =>
    executeFunction(
      {
        params: {},
        config: { timeout: 30 },
        handler: async (_args, { signal }) => {
          try {
            await delay(5000, undefined, { signal })
          } finally {
            aborted = signal.aborted
            await cleanup.promise
          }
        },
      },
      {}
    )
  )
  await assert.rejects(first, FunctionTimeoutError)
  await tick()
  assert.equal(aborted, true)
  assert.equal(getUsedSlots(), 1)
  cleanup.resolve()
  await tick()
  assert.equal(getUsedSlots(), 0)
})

test('ordinary failures still retry sequentially with fresh signals; successful timers are cleared', async () => {
  const signals = []
  const result = await executeFunction(
    {
      params: {},
      config: { timeout: 30, maxRetries: 2 },
      handler: async (_args, { signal }) => {
        signals.push(signal)
        if (signals.length < 3) throw new Error('ordinary failure')
        return 'ok'
      },
    },
    {}
  )
  assert.equal(result, 'ok')
  assert.equal(new Set(signals).size, 3)
  await delay(50)
  assert.ok(signals.every(signal => !signal.aborted))
  assert.deepEqual(getTimedOutExecutions(), [])
})
