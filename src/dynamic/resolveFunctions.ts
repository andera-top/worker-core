import fs from 'fs'
import path from 'path'
import { log } from '../utils/logger'
import type { FunctionDefinition } from '../types/task.types'

const functions = new Map<string, FunctionDefinition>()

export async function resolveFunctions(dir: string): Promise<Map<string, FunctionDefinition>> {
  if (!fs.existsSync(dir)) return new Map()
  const files = fs
    .readdirSync(dir)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'))
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))

  for (const file of files) {
    const name = path.basename(file, path.extname(file)).replace('.example', '')
    const fullPath = path.resolve(dir, file)

    try {
      const mod = await import(fullPath)
      const def: FunctionDefinition = mod[name] || mod.default
      if (def && typeof def.handler === 'function') {
        functions.set(name, def)
        log('[FUNCTION]', `Function '${name}' loaded`)
      } else {
        log('[FUNCTION]', `File '${file}' does not export a valid function definition (missing 'handler')`)
      }
    } catch (err) {
      log('[FUNCTION]', `Failed to load function '${file}':`, err)
    }
  }

  return functions
}

export function getFunction(name: string) {
  return functions.get(name)
}
