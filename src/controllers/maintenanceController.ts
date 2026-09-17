import express, { Router, Request, Response } from 'express'
import { enableMaintenance, disableMaintenance, isInMaintenance } from '../slots/slotsManager'
import { requireAuth } from '../middleware/auth'

export const maintenanceController: Router = express.Router()

maintenanceController.post('/on', requireAuth(), (_req: Request, res: Response) => {
  disableMaintenance()
  res.json({ status: 'ready', message: 'Maintenance mode disabled' })
})

maintenanceController.post('/off', requireAuth(), (_req: Request, res: Response) => {
  enableMaintenance()
  res.json({ status: 'maintenance', message: 'Maintenance mode enabled' })
})
