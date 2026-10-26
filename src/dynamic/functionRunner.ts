import { log } from '../utils/logger'
import { config, MAX_TIMER_DELAY } from '../config'
import type { FunctionDefinition, FunctionConfig, FunctionContext, ParamSchema } from '../types/task.types'
import { isDeepStrictEqual } from 'util'

export function defineFunction(def: FunctionDefinition): FunctionDefinition {
  return def
}

export class FunctionInputError extends Error {}

/** Rejects settings that would make every call fail. */
export function assertFunctionConfig(functionConfig: FunctionConfig = {}) {
  const { timeout = config.worker.defaultTimeout, maxRetries = 0 } = functionConfig
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMER_DELAY)
    throw new Error(`Function timeout must be an integer between 1 and ${MAX_TIMER_DELAY}`)
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('Function maxRetries must be a non-negative integer')
}

export class FunctionTimeoutError extends Error {
  constructor(readonly completion: Promise<void>) {
    super('Function execution timed out')
    this.name = 'FunctionTimeoutError'
  }
}

const timedOutExecutions = new Map<symbol, { function: string; startedAt: string; timedOutAt: string; timeoutMs: number }>()

export function getTimedOutExecutions() {
  return Array.from(timedOutExecutions.values(), entry => ({ ...entry }))
}

export async function executeFunction(
  def: FunctionDefinition,
  rawInput: any,
  context?: Omit<FunctionContext, 'signal'>,
  functionName = 'anonymous'
): Promise<any> {
  const params = validateParams(def.params, rawInput)
  assertFunctionConfig(def.config)
  const { timeout: timeoutMs = config.worker.defaultTimeout, maxRetries = 0 } = def.config ?? {}

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController()
    const executionId = Symbol()
    const startedAt = new Date().toISOString()
    let acceptingStream = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const handlerContext: FunctionContext = {
      ...context,
      signal: controller.signal,
      stream: context?.stream
        ? chunk => {
            if (acceptingStream && !controller.signal.aborted) context.stream?.(chunk)
          }
        : undefined,
    }
    // Capture synchronous throws too. Completion always settles successfully so
    // the queue can wait for cleanup without creating an unhandled rejection.
    const handler = Promise.resolve().then(() => def.handler(params, handlerContext))
    const clearExecution = () => {
      timedOutExecutions.delete(executionId)
    }
    const completion = handler.then(clearExecution, clearExecution)
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new FunctionTimeoutError(completion)
          timedOutExecutions.set(executionId, { function: functionName, startedAt, timedOutAt: new Date().toISOString(), timeoutMs })
          acceptingStream = false
          // Settle the deadline first, even if an abort listener rejects or
          // resolves the handler synchronously while performing cleanup.
          reject(error)
          controller.abort(error)
        }, timeoutMs)
      })
      return await Promise.race([handler, deadline])
    } catch (err) {
      log('[FUNCTION]', `Function failed (attempt ${attempt}/${maxRetries + 1})`, err)
      if (err instanceof FunctionTimeoutError || attempt > maxRetries) throw err
    } finally {
      acceptingStream = false
      if (timer) clearTimeout(timer)
    }
  }
}

function validateParams(schema: { [key: string]: ParamSchema } = {}, input: any): any {
  const output: any = Object.create(null)

  if (input && typeof input === 'object') {
    for (const key of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(schema, key)) {
        throw new FunctionInputError(`Unexpected param: ${key}`)
      }
    }
  }

  for (const [key, rule] of Object.entries(schema)) {
    let value = input && Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined

    if (value === undefined) {
      if (rule.required) throw new FunctionInputError(`Missing required param: ${key}`)
      value = rule.default && typeof rule.default === 'object' ? structuredClone(rule.default) : rule.default
    }

    if (value !== undefined && !isTypeValid(rule.type, value)) {
      throw new FunctionInputError(`Invalid type for param: ${key}, expected ${rule.type}`)
    }

    if (rule.enum && value !== undefined && !rule.enum.some(option => isDeepStrictEqual(option, value))) {
      throw new FunctionInputError(`Invalid value for param: ${key}, expected one of ${JSON.stringify(rule.enum)}`)
    }

    if (rule.pattern && typeof value === 'string') {
      const regex = new RegExp(rule.pattern, 'u')
      if (!regex.test(value)) {
        throw new FunctionInputError(`Invalid format for param: ${key}, does not match pattern ${rule.pattern}`)
      }
    }

    if (rule.min !== undefined) {
      if (typeof value === 'number' && value < rule.min) {
        throw new FunctionInputError(`Value for param: ${key} must be >= ${rule.min}`)
      }
      if (typeof value === 'string' && Array.from(value).length < rule.min) {
        throw new FunctionInputError(`Length of param: ${key} must be >= ${rule.min}`)
      }
      if (Array.isArray(value) && value.length < rule.min) {
        throw new FunctionInputError(`Length of param: ${key} must be >= ${rule.min}`)
      }
    }
    if (rule.max !== undefined) {
      if (typeof value === 'number' && value > rule.max) {
        throw new FunctionInputError(`Value for param: ${key} must be <= ${rule.max}`)
      }
      if (typeof value === 'string' && Array.from(value).length > rule.max) {
        throw new FunctionInputError(`Length of param: ${key} must be <= ${rule.max}`)
      }
      if (Array.isArray(value) && value.length > rule.max) {
        throw new FunctionInputError(`Length of param: ${key} must be <= ${rule.max}`)
      }
    }

    output[key] = value
  }

  return output
}

function isTypeValid(type: string, value: any): boolean {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return typeof value === type
}
