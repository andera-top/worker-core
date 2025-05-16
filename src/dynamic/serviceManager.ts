import { log } from '../utils/logger'

type ServiceDefinition = {
  config?: {
    restartOnFailure?: boolean
  }
  start: () => Promise<void>
  stop?: () => Promise<void>
  status?: () => Promise<any>
}

type InternalService = ServiceDefinition & {
  name: string
  restarting?: boolean
}

const services: InternalService[] = []

export function defineService(def: ServiceDefinition): ServiceDefinition {
  return def
}

export async function registerService(name: string, def: ServiceDefinition) {
  const svc: InternalService = { name, ...def }
  services.push(svc)

  try {
    await def.start()
    log('[SERVICE]', `Service '${name}' started`)
  } catch (err) {
    log('[SERVICE]', `Service '${name}' failed to start:`, err)
    if (def.config?.restartOnFailure) restartService(name, def)
  }
}

async function restartService(name: string, def: ServiceDefinition, attempt = 1) {
  const svc = services.find(s => s.name === name)
  if (!svc || svc.restarting) return
  svc.restarting = true

  const delay = Math.min(1000 * 2 ** attempt, 30000)
  setTimeout(async () => {
    try {
      await def.start()
      svc.restarting = false
      log('[SERVICE]', `Service '${name}' restarted successfully`)
    } catch (err) {
      log('[SERVICE]', `Service '${name}' failed to restart:`, err)
      svc.restarting = false
      restartService(name, def, attempt + 1)
    }
  }, delay)
}

export async function stopAllServices() {
  for (const svc of services) {
    if (svc.stop) {
      try {
        await svc.stop()
        log('[SERVICE]', `Service '${svc.name}' stopped`)
      } catch (err) {
        log('[SERVICE]', `Failed to stop '${svc.name}':`, err)
      }
    }
  }
}

export async function getServiceTags(): Promise<Record<string, any>> {
  const tags: Record<string, any> = {}
  for (const svc of services) {
    if (svc.status) {
      try {
        tags[svc.name] = await svc.status()
      } catch {
        tags[svc.name] = { error: 'Status failed' }
      }
    }
  }
  return tags
}

export function getServices(): InternalService[] {
  return [...services]
}
