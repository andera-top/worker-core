import fs from 'fs'
import path from 'path'
import { log } from '../utils/logger'

export function resolveTags(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('.') && !f.startsWith('_'))
    .map(f => path.resolve(dir, f))
}

export async function collectTags(dir: string): Promise<Record<string, any>> {
  const files = resolveTags(dir)
  const result: Record<string, any> = {}

  for (const file of files) {
    try {
      const mod = await import(file)
      if (typeof mod.tags === 'function') {
        const tags = await mod.tags()
        if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
          for (const [name, value] of Object.entries(tags)) {
            result[name] = value
          }
        } else {
          log('[TAGS]', `Tags function in '${file}' did not return an object (associative array)`)
        }
      } else {
        log('[TAGS]', `File '${file}' does not export a 'tags' function`)
      }
    } catch (err) {
      log('[TAGS]', `Failed to load tags from ${file}:`, err)
    }
  }

  return result
}
