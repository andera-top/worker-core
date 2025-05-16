import express, { Router, Request, Response } from 'express'
import { getFunction } from '../dynamic/resolveFunctions'
import { executeFunction } from '../dynamic/functionRunner'
import { sendWebhook } from '../utils/webhookManager'
import { log, warn } from '../utils/logger'
import { addTaskToQueue } from '../slots/taskQueue'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'

export const taskController: Router = express.Router()

taskController.post('/task', requireAuth({ type: 'both' }), async (req: Request, res: Response) => {
  const { isInMaintenance } = await import('../slots/slotsManager')
  if (isInMaintenance()) {
    return res.status(503).json({ error: 'Worker is in maintenance mode' })
  }

  const { function: fnName, input, priority = 1, contract, mode, webhook } = req.body
  const parsedPriority = Number(priority)

  if (Number.isNaN(parsedPriority) || parsedPriority < 1 || parsedPriority > 2097152) {
    warn('[TASK]', 'Rejected request: invalid priority value')
    return res.status(400).json({ error: 'Invalid priority: must be between 1 and 2097152' })
  }

  if (!fnName || typeof fnName !== 'string') {
    warn('[TASK]', 'Rejected request: missing or invalid function name')
    return res.status(400).json({ error: 'Missing or invalid function name' })
  }

  if (!contract || typeof contract !== 'number') {
    warn('[TASK]', 'Rejected request: missing or invalid contract')
    return res.status(400).json({ error: 'Missing or invalid contract' })
  }

  if (contract !== config.contract) {
    warn('[TASK]', `Rejected request: contract version mismatch (requested: ${contract}, worker: ${config.contract})`)
    return res.status(400).json({ error: `Contract version mismatch: requested ${contract}, worker is ${config.contract}` })
  }

  if (input !== undefined && typeof input !== 'object') {
    warn('[TASK]', 'Rejected request: invalid input, must be an object')
    return res.status(400).json({ error: 'Invalid input: must be an object' })
  }

  if (mode && !['sync', 'stream', 'webhook'].includes(mode)) {
    warn('[TASK]', 'Rejected request: invalid mode')
    return res.status(400).json({ error: 'Invalid mode' })
  }

  const fn = getFunction(fnName)
  if (!fn) {
    warn('[TASK]', `Rejected request: function '${fnName}' not found`)
    return res.status(404).json({ error: `Function '${fnName}' not found` })
  }

  log('[TASK]', `Function call: ${fnName} | input: ${JSON.stringify(input)} | contract: ${contract} | mode: ${mode}`)

  if (mode === 'stream' && !fn.config?.supportsStreaming) {
    warn('[TASK]', `Rejected request: function '${fnName}' does not support streaming`)
    return res.status(400).json({ error: `Function '${fnName}' does not support streaming` })
  }

  if (mode === 'webhook' && (!webhook || typeof webhook !== 'object' || typeof webhook.url !== 'string')) {
    warn('[TASK]', 'Rejected request: missing or invalid webhook.url for mode webhook')
    return res.status(400).json({ error: 'Missing or invalid webhook.url for mode webhook' })
  }

  const runTask = async () => {
    try {
      const context: any = {}
      if (mode === 'stream') {
        res.setHeader('Content-Type', 'text/plain')
        context.stream = (chunk: string) => res.write(chunk)
      }

      const result = await executeFunction(fn, input, context)

      if (fn.config?.logResult !== false) {
        log('[TASK]', `Function result: ${fnName} | result: ${JSON.stringify(result)}`)
      } else {
        log('[TASK]', `Function result: ${fnName} | result: [not logged]`)
      }

      if (mode === 'stream') {
        res.end()
      } else if (mode === 'webhook') {
        try {
          await sendWebhook(webhook.url, result, webhook.headers)
          res.json({ success: true, message: 'Sent to webhook' })
        } catch (err: any) {
          log('[TASK]', `Failed to send webhook: ${err.message}`)
          res.status(500).json({ success: false, error: `Failed to send webhook: ${err.message}` })
        }
      } else {
        res.json({ success: true, result })
      }
    } catch (err: any) {
      log('[TASK]', `Function error: ${fnName} | error: ${err.message}`)
      res.status(500).json({ success: false, error: err.message || 'Internal error' })
    }
  }

  await addTaskToQueue(parsedPriority, runTask)
})
