import express, { Router, Request, Response } from 'express'
import { sendWebhook } from '../utils/webhookManager'
import { log } from '../utils/logger'
import { requireAuth } from '../middleware/auth'
import { executeTask, TaskError } from '../dynamic/taskExecution'
import { FunctionTimeoutError } from '../dynamic/functionRunner'
import { config } from '../config'

export const taskController: Router = express.Router()

taskController.post('/task', requireAuth({ type: 'both' }), express.json({ limit: config.requestBodyLimit }), async (req: Request, res: Response) => {
  try {
    const { mode, webhook } = req.body || {}
    const context =
      mode === 'stream'
        ? {
            stream: (chunk: string) => {
              if (!res.headersSent) res.setHeader('Content-Type', 'text/plain')
              res.write(chunk)
            },
          }
        : undefined
    const result = await executeTask(req.body, context)
    if (mode === 'stream') {
      res.end()
    } else if (mode === 'webhook') {
      try {
        await sendWebhook(webhook.url, result, webhook.headers)
      } catch {
        // The function already ran: report the delivery failure so callers do not re-run it.
        log('[TASK]', 'Webhook delivery failed')
        return res.status(502).json({ success: false, error: 'Failed to send webhook', code: 'WEBHOOK_FAILED' })
      }
      res.json({ success: true, message: 'Sent to webhook' })
    } else {
      res.json({ success: true, result })
    }
  } catch (err: any) {
    log('[TASK]', 'Function execution failed')
    if (res.headersSent) {
      res.end()
      return
    }
    if (err instanceof FunctionTimeoutError) {
      return res.status(504).json({ success: false, error: 'Function execution timed out', code: 'FUNCTION_TIMEOUT' })
    }
    const status = err instanceof TaskError ? err.status : 500
    res.status(status).json({ success: false, error: err instanceof TaskError ? err.message : 'Function execution failed' })
  }
})
