import express, { Router, Request, Response } from 'express'
import { enableMaintenance, disableMaintenance, isInMaintenance } from '../slots/slotsManager'
import { broadcastStatus } from '../websocket/websocketServer'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'

export const maintenanceController: Router = express.Router()

maintenanceController.post('/on', requireAuth(), (_req: Request, res: Response) => {
  disableMaintenance()
  broadcastStatus()
  res.json({ status: 'ready', message: 'Maintenance mode disabled' })
})

maintenanceController.post('/off', requireAuth(), (_req: Request, res: Response) => {
  enableMaintenance()
  broadcastStatus()
  res.json({ status: 'maintenance', message: 'Maintenance mode enabled' })
})
