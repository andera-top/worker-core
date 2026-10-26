import fs from 'fs'
import path from 'path'
import { log } from '../utils/logger'
import type { FunctionDefinition } from '../types/task.types'
import { assertFunctionConfig } from './functionRunner'

const functions = new Map<string, FunctionDefinition>()

export async function resolveFunctions(dir: string): Promise<Map<string, FunctionDefinition>> {
  functions.clear()
  if (!fs.existsSync(dir)) return new Map()
  const files = fs
    .readdirSync(dir)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'))
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))

  for (const file of files) {
    const name = path.basename(file, path.extname(file)).replace('.example', '')
    const fullPath = path.resolve(dir, file)

    let def: FunctionDefinition | undefined
    try {
      const mod = await import(fullPath)
      def = mod[name] || mod.default
    } catch (err) {
      log('[FUNCTION]', `Failed to load function '${file}':`, err)
      continue
    }
    if (def && typeof def.handler === 'function') {
      // Fail at startup rather than on every call.
      try {
        assertFunctionConfig(def.config)
      } catch (err) {
        throw new Error(`Invalid config for function '${name}': ${(err as Error).message}`)
      }
      // Every consumer expects a schema object.
      functions.set(name, def.params ? def : { ...def, params: {} })
      log('[FUNCTION]', `Function '${name}' loaded`)
    } else {
      log('[FUNCTION]', `File '${file}' does not export a valid function definition (missing 'handler')`)
    }
  }

  return functions
}

export function getFunction(name: string) {
  return functions.get(name)
}
