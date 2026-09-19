import { config } from '../config'
import express, { Router, Request, Response, NextFunction } from 'express'
import { isInMaintenance, getUsedSlots, getMaxSlots, getAvailableSlots } from '../slots/slotsManager'
import { collectTags } from '../dynamic/resolveTags'
import path from 'path'
import { getWorkerRootDir, getLoadedFunctions } from '../app'
import { getQueueLength } from '../slots/taskQueue'
import { areAllServicesUp, getServicesHealth } from '../dynamic/resolveServices'
import { getCpuLoad, getUsedMemoryPercent } from '../utils/systemStats'
import { getTimedOutExecutions } from '../dynamic/functionRunner'
import { getMcpStatus } from '../mcp/state'

export const healthController: Router = express.Router()

function workerStatus() {
  if (isInMaintenance()) return 'maintenance'
  return areAllServicesUp() ? 'ready' : 'unavailable'
}

healthController.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rawAuth = _req.headers['authorization'] || _req.headers['x-lb-auth']
    let authKey = typeof rawAuth === 'string' ? rawAuth : undefined

    if (authKey && authKey.startsWith('Bearer ')) {
      authKey = authKey.slice(7).trim()
    }

    const isAuthorized = authKey === config.authKey || authKey === config.lbAuthKey

    if (!isAuthorized) {
      return res.json({
        status: workerStatus(),
      })
    }

    const tagsDir = path.join(getWorkerRootDir(), 'tags')
    const tags = await collectTags(tagsDir)

    const functionsMap = getLoadedFunctions() || new Map()
    const functions = Array.from(functionsMap.entries()).map(([name, def]) => ({
      name,
      description: def.description,
      params: def.params,
      config: { supportsStreaming: def.config?.supportsStreaming === true },
    }))

    const uptime = process.uptime()
    const usedMemoryPercent = await getUsedMemoryPercent()

    res.json({
      status: workerStatus(),
      group: config.group,
      contract: config.contract,
      websocketPort: config.websocketPort,
      functions,
      mcp: getMcpStatus(),
      services: getServicesHealth(),
      executions: { timedOutRunning: getTimedOutExecutions() },
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
  } catch (error) {
    next(error)
  }
})
