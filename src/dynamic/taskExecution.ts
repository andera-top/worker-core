import { getFunction } from './resolveFunctions'
import { executeFunction, FunctionInputError } from './functionRunner'
import { addTaskToQueue } from '../slots/taskQueue'
import { isInMaintenance } from '../slots/slotsManager'
import { config } from '../config'
import { log } from '../utils/logger'

export class TaskError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function validWebhookUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

/** Shared REST/MCP execution path; neither transport can bypass contracts or slots. */
export async function executeTask(payload: any, context?: { stream?: (chunk: string) => void }): Promise<any> {
  if (isInMaintenance()) throw new TaskError(503, 'Worker is in maintenance mode')
  const { function: name, input, priority = 1, contract, mode, webhook } = payload || {}
  const parsedPriority = Number(priority)
  if (!Number.isInteger(parsedPriority) || parsedPriority < 1 || parsedPriority > 2097152)
    throw new TaskError(400, 'Invalid priority: must be an integer between 1 and 2097152')
  if (!name || typeof name !== 'string') throw new TaskError(400, 'Missing or invalid function name')
  if (!Number.isSafeInteger(contract) || contract < 1) throw new TaskError(400, 'Missing or invalid contract')
  if (contract !== config.contract) throw new TaskError(400, 'Contract version mismatch')
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new TaskError(400, 'Invalid input, must be an object')
  if (mode && !['sync', 'stream', 'webhook'].includes(mode)) throw new TaskError(400, 'Invalid mode')
  const definition = getFunction(name)
  if (!definition) throw new TaskError(404, 'Function not found')
  if (mode === 'stream' && !definition.config?.supportsStreaming) throw new TaskError(400, 'Function does not support streaming')
  if (
    mode === 'webhook' &&
    (!webhook ||
      typeof webhook !== 'object' ||
      !validWebhookUrl(webhook.url) ||
      (webhook.headers !== undefined && (!webhook.headers || typeof webhook.headers !== 'object' || Array.isArray(webhook.headers))))
  ) {
    throw new TaskError(400, 'Missing or invalid webhook.url for mode webhook')
  }

  let result: any
  try {
    await addTaskToQueue(parsedPriority, async () => {
      if (isInMaintenance()) throw new TaskError(503, 'Worker is in maintenance mode')
      log('[TASK]', 'Function call:', name)
      result = await executeFunction(definition, input, context)
      if (definition.config?.logResult !== false) log('[TASK]', 'Function result:', name, result)
    })
  } catch (error) {
    if (error instanceof FunctionInputError) throw new TaskError(400, error.message)
    throw error
  }
  return result
}
