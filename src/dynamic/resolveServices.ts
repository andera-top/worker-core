import fs from 'fs'
import path from 'path'
import { log } from '../utils/logger'
import { broadcastStatus } from '../websocket/websocketServer'
import type { ServiceDefinition } from '../types/service.types'

type ServiceState = 'up' | 'down' | 'restarting'
type RunningService = { name: string; def: ServiceDefinition; status?: any; state: ServiceState }
const runningServices: RunningService[] = []
let lifecycleStarted = false

function processWaitingTasks() {
  void import('../slots/taskQueue').then(({ processQueue }) => processQueue()).catch(() => {})
}

export async function resolveServices(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return
  const files = fs
    .readdirSync(dir)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'))
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))

  for (const file of files) {
    const name = path.basename(file, path.extname(file))
    const fullPath = path.resolve(dir, file)
    let def: ServiceDefinition | undefined

    try {
      const mod = await import(fullPath)
      def = mod[name] || mod.default
      if (def && typeof def.start === 'function') {
        await def.start()
        runningServices.push({ name, def, state: 'up' })
        log('[SERVICE]', `Service '${name}' started`)
      } else {
        log('[SERVICE]', `File '${file}' does not export a valid service definition (missing 'start')`)
      }
    } catch (err) {
      log('[SERVICE]', `Failed to start service '${file}':`, err)
      runningServices.push({ name, def: def || ({} as ServiceDefinition), state: 'down', status: { error: err instanceof Error ? err.message : String(err) } })
    }
  }
  startServiceLifecycle()
}

export async function stopAllServices() {
  for (const svc of runningServices) {
    if (typeof svc.def.stop === 'function') {
      try {
        await svc.def.stop()
        log('[SERVICE]', `Service '${svc.name}' stopped`)
      } catch (e) {
        log('[SERVICE]', `Error stopping service ${svc.name}:`, e)
      }
    }
  }
}

export async function getServiceTags(): Promise<Record<string, any>> {
  const tags: Record<string, any> = Object.create(null)
  for (const svc of runningServices) {
    if (!svc.def.status) continue
    try {
      tags[svc.name] = await svc.def.status()
    } catch {
      tags[svc.name] = { error: 'Status failed' }
    }
  }
  return tags
}

let healthCheckRunning = false
async function restartService(svc: RunningService) {
  if (!svc.def.config?.restartOnFailure || typeof svc.def.start !== 'function') return
  svc.state = 'restarting'
  broadcastStatus()
  log('[SERVICE]', `Restarting service '${svc.name}'...`)
  try {
    await svc.def.start()
    svc.state = 'up'
    svc.status = undefined
    broadcastStatus()
    processWaitingTasks()
    log('[SERVICE]', `Service '${svc.name}' restarted successfully`)
  } catch (err) {
    svc.state = 'down'
    svc.status = { error: err instanceof Error ? err.message : String(err) }
    broadcastStatus()
    log('[SERVICE]', `Failed to restart service '${svc.name}':`, err)
  }
}

async function checkServices() {
  if (healthCheckRunning) return
  healthCheckRunning = true
  try {
    for (const svc of runningServices) {
      if (typeof svc.def.status !== 'function') {
        if (svc.state === 'down') await restartService(svc)
        continue
      }
      if (typeof svc.def.status === 'function') {
        try {
          svc.status = await svc.def.status()
          if (svc.state !== 'up') {
            log('[SERVICE]', `Service '${svc.name}' is UP`)
            svc.state = 'up'
            broadcastStatus()
            processWaitingTasks()
          }
        } catch (e) {
          svc.status = { error: e instanceof Error ? e.message : String(e) }
          if (svc.state !== 'down') {
            log('[SERVICE]', `Service '${svc.name}' is DOWN: ${svc.status.error}`)
            svc.state = 'down'
            broadcastStatus()
          }
          if (typeof svc.def.stop === 'function') {
            try {
              await svc.def.stop()
              log('[SERVICE]', `Service '${svc.name}' stopped before restart`)
            } catch {}
          }
          await restartService(svc)
        }
      }
    }
  } finally {
    healthCheckRunning = false
  }
}

function startServiceLifecycle() {
  if (lifecycleStarted) return
  lifecycleStarted = true
  process.on('SIGTERM', async () => {
    await stopAllServices()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    await stopAllServices()
    process.exit(0)
  })
  setInterval(() => {
    void checkServices()
  }, 1000)
}

export function getServicesHealth() {
  return runningServices.map(svc => ({
    name: svc.name,
    status: svc.status ?? 'unknown',
    state: svc.state,
  }))
}

export function areAllServicesUp(): boolean {
  return runningServices.every(svc => svc.state === 'up')
}
