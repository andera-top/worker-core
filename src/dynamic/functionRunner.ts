import { log } from '../utils/logger'
import { config } from '../config'
import type { FunctionDefinition, ParamSchema } from '../types/task.types'

export function defineFunction(def: FunctionDefinition): FunctionDefinition {
  return def
}

export async function executeFunction(def: FunctionDefinition, rawInput: any, context?: { stream?: (chunk: string) => void; webhook?: string }): Promise<any> {
  const params = validateParams(def.params, rawInput)
  const { timeout: timeoutMs = config.worker.defaultTimeout, maxRetries = 0 } = def.config ?? {}

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await Promise.race([def.handler(params, context), timeout(timeoutMs)])
      return result
    } catch (err) {
      log('[FUNCTION]', `Function failed (attempt ${attempt}/${maxRetries + 1})`, err)
      if (attempt > maxRetries) throw err
    }
  }
}

function validateParams(schema: { [key: string]: ParamSchema }, input: any): any {
  const output: any = {}

  if (input && typeof input === 'object') {
    for (const key of Object.keys(input)) {
      if (!(key in schema)) {
        throw new Error(`Unexpected param: ${key}`)
      }
    }
  }

  for (const key in schema) {
    const rule = schema[key]
    let value = input?.[key]

    if (value === undefined) {
      if (rule.required) throw new Error(`Missing required param: ${key}`)
      value = rule.default
    }

    if (value !== undefined && !isTypeValid(rule.type, value)) {
      throw new Error(`Invalid type for param: ${key}, expected ${rule.type}`)
    }

    if (rule.enum && value !== undefined && !rule.enum.includes(value)) {
      throw new Error(`Invalid value for param: ${key}, expected one of ${JSON.stringify(rule.enum)}`)
    }

    if (rule.pattern && typeof value === 'string') {
      const regex = new RegExp(rule.pattern)
      if (!regex.test(value)) {
        throw new Error(`Invalid format for param: ${key}, does not match pattern ${rule.pattern}`)
      }
    }

    if (rule.min !== undefined) {
      if (typeof value === 'number' && value < rule.min) {
        throw new Error(`Value for param: ${key} must be >= ${rule.min}`)
      }
      if (typeof value === 'string' && value.length < rule.min) {
        throw new Error(`Length of param: ${key} must be >= ${rule.min}`)
      }
      if (Array.isArray(value) && value.length < rule.min) {
        throw new Error(`Length of param: ${key} must be >= ${rule.min}`)
      }
    }
    if (rule.max !== undefined) {
      if (typeof value === 'number' && value > rule.max) {
        throw new Error(`Value for param: ${key} must be <= ${rule.max}`)
      }
      if (typeof value === 'string' && value.length > rule.max) {
        throw new Error(`Length of param: ${key} must be <= ${rule.max}`)
      }
      if (Array.isArray(value) && value.length > rule.max) {
        throw new Error(`Length of param: ${key} must be <= ${rule.max}`)
      }
    }

    output[key] = value
  }

  return output
}

function isTypeValid(type: string, value: any): boolean {
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return typeof value === type
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms)
  })
}
