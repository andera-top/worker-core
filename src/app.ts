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

configureSlots(config.worker.slots)

const app = express()

app.use(compression())
app.use(express.json({ limit: config.requestBodyLimit }))

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

  mountControllers(app)

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

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('Unhandled error:', err)
  if (res.headersSent) {
    return next(err)
  }
  res.status(500).json({ error: 'Internal server error' })
})
