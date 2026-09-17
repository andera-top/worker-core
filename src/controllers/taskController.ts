import express, { Router, Request, Response } from 'express'
import { sendWebhook } from '../utils/webhookManager'
import { log } from '../utils/logger'
import { requireAuth } from '../middleware/auth'
import { executeTask, TaskError } from '../dynamic/taskExecution'
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
      await sendWebhook(webhook.url, result, webhook.headers)
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
    const status = err instanceof TaskError ? err.status : 500
    res.status(status).json({ success: false, error: err instanceof TaskError ? err.message : 'Function execution failed' })
  }
})
