import express, { Router, Request, Response } from 'express'
import { getLogs } from '../utils/logger'
import { requireAuth } from '../middleware/auth'

export const logsController: Router = express.Router()

logsController.get('/logs', requireAuth({ type: 'any' }), (req: Request, res: Response) => {
  const logs = getLogs()
  res.json({ logs })
})
