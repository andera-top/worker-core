import { log } from '../utils/logger'
import { config } from '../config'
import type { FunctionDefinition, ParamSchema } from '../types/task.types'
import { isDeepStrictEqual } from 'util'

export function defineFunction(def: FunctionDefinition): FunctionDefinition {
  return def
}

export class FunctionInputError extends Error {}

export async function executeFunction(def: FunctionDefinition, rawInput: any, context?: { stream?: (chunk: string) => void; webhook?: string }): Promise<any> {
  const params = validateParams(def.params, rawInput)
  const { timeout: timeoutMs = config.worker.defaultTimeout, maxRetries = 0 } = def.config ?? {}
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Function timeout must be a positive integer')
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('Function maxRetries must be a non-negative integer')

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      })
      const result = await Promise.race([def.handler(params, context), deadline])
      return result
    } catch (err) {
      log('[FUNCTION]', `Function failed (attempt ${attempt}/${maxRetries + 1})`, err)
      if (attempt > maxRetries) throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

function validateParams(schema: { [key: string]: ParamSchema }, input: any): any {
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
