import express from 'express'
import path from 'path'
import compression from 'compression'
import { resolveFunctions } from './dynamic/resolveFunctions'
import { resolveServices } from './dynamic/resolveServices'
import { configureSlots } from './slots/slotsManager'
import { config } from './config'
import { log } from './utils/logger'
import { startWebSocketServer } from './websocket/websocketServer'
import { taskController } from './controllers/taskController'
import { healthController } from './controllers/healthController'
import { logsController } from './controllers/logsController'
import { maintenanceController } from './controllers/maintenanceController'
import { collectTags } from './dynamic/resolveTags'
import { defaultController } from './controllers/defaultController'
import openAPIController from './controllers/openAPIController'
import { createWorkerMcp } from './mcp/runtime'
import { setMcpStatus } from './mcp/state'
import { executeTask } from './dynamic/taskExecution'
import { isInMaintenance } from './slots/slotsManager'
import { areAllServicesUp } from './dynamic/resolveServices'

configureSlots(config.worker.slots)

const app = express()

app.use(compression())

function mountControllers(app: express.Application) {
  app.use(defaultController)
  app.use(taskController)
  app.use(healthController)
  app.use(logsController)
  app.use(maintenanceController)

  if (config.enableOpenAPI) {
    app.use(openAPIController)
  }
}

let workerRootDir: string | undefined
let loadedFunctions: Map<string, any> | undefined

export async function bootstrap(config: any, rootDir?: string) {
  workerRootDir = rootDir || path.resolve(__dirname)

  loadedFunctions = await resolveFunctions(path.join(workerRootDir, 'functions'))
  await resolveServices(path.join(workerRootDir, 'services'))
  await collectTags(path.join(workerRootDir, 'tags'))

  const mcp = createWorkerMcp({
    root: path.resolve(workerRootDir, '..'),
    functions: () => loadedFunctions || new Map(),
    available: () => !isInMaintenance() && areAllServicesUp(),
    execute: executeTask,
    report: message => log('[MCP]', message),
  })
  setMcpStatus(mcp.status)
  app.use('/mcp', mcp.router)
  mountControllers(app)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    log('[WORKER]', 'Unhandled request error')
    if (res.headersSent) return next(err)
    const status = err?.type === 'entity.too.large' ? 413 : err instanceof SyntaxError && 'body' in err ? 400 : 500
    res.status(status).json({ error: status < 500 ? 'Invalid request' : 'Internal server error' })
  })

  startWebSocketServer()

  app.listen(config.port, () => {
    log('[WORKER]', `Worker ready on port ${config.port}`)
  })
}

export function getWorkerRootDir() {
  return workerRootDir || path.resolve(__dirname)
}

export function getLoadedFunctions() {
  return loadedFunctions
}
