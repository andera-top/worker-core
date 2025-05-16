import { config } from '../config'
import express, { Router, Request, Response } from 'express'
import { isInMaintenance, getUsedSlots, getMaxSlots, getAvailableSlots } from '../slots/slotsManager'
import { collectTags } from '../dynamic/resolveTags'
import path from 'path'
import { getWorkerRootDir, getLoadedFunctions } from '../app'
import { getQueueLength } from '../slots/taskQueue'
import { getServicesHealth } from '../dynamic/resolveServices'
import { getCpuLoad, getUsedMemoryPercent } from '../utils/systemStats'

export const healthController: Router = express.Router()

healthController.get('/health', async (_req: Request, res: Response) => {
  const rawAuth = _req.headers['authorization'] || _req.headers['x-lb-auth']
  let authKey = typeof rawAuth === 'string' ? rawAuth : undefined

  if (authKey && authKey.startsWith('Bearer ')) {
    authKey = authKey.slice(7).trim()
  }

  const isAuthorized = authKey === config.authKey || authKey === config.lbAuthKey

  if (!isAuthorized) {
    return res.json({
      status: isInMaintenance() ? 'maintenance' : 'ready',
    })
  }

  const tagsDir = path.join(getWorkerRootDir(), 'tags')
  const tags = await collectTags(tagsDir)

  const functionsMap = getLoadedFunctions() || new Map()
  const functions = Array.from(functionsMap.entries()).map(([name, def]) => ({
    name,
    params: def.params,
  }))

  const uptime = process.uptime()
  const usedMemoryPercent = await getUsedMemoryPercent()

  res.json({
    status: isInMaintenance() ? 'maintenance' : 'ready',
    group: config.group,
    contract: config.contract,
    websocketPort: config.websocketPort,
    functions,
    services: getServicesHealth(),
    tags,
    slots: {
      used: getUsedSlots(),
      available: getAvailableSlots(),
      limit: getMaxSlots(),
      queue: getQueueLength(),
    },
    system: {
      uptime,
      usedMemoryPercent: Math.round(usedMemoryPercent * 1000) / 10,
      cpuLoad: getCpuLoad(),
    },
  })
})
