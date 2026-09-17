import path from 'path'
import type { FunctionDefinition } from '../types/task.types'
import { LiveConfig, parseWorkerConfig, allows } from './config'
import { inputSchema, localToolName } from './schema'
import { createMcpRouter, dedicatedToken, describeTools, ExposedTool } from './transport'

export function createWorkerMcp(options: {
  root: string
  env?: NodeJS.ProcessEnv
  functions: () => Map<string, FunctionDefinition>
  available: () => boolean
  execute: (payload: any) => Promise<unknown>
  report?: (message: string) => void
}) {
  const env = options.env ?? process.env
  const config = new LiveConfig(path.resolve(options.root, env.MCP_CONFIG_PATH || 'mcp.json'), parseWorkerConfig, options.report)
  const token = dedicatedToken(env.MCP_AUTH_KEY, [env.AUTH_KEY, env.LB_AUTH_KEY])
  const enabled = () => !!token && config.current() !== undefined
  const tools = (): ExposedTool[] => {
    const settings = config.current()
    if (!token || !settings) return []
    return Array.from(options.functions())
      .filter(([name]) => allows(settings, name))
      .map(([name, def]) => ({
        function: name,
        available: options.available(),
        tool: { name: localToolName(name), description: def.description || 'Execute ' + name, inputSchema: inputSchema(def.params) },
        invoke: async (args: Record<string, unknown>) => {
          const current = config.current()
          if (!current || !allows(current, name)) throw new Error('Tool revoked')
          return options.execute({ function: name, input: args, contract: Number(env.CONTRACT || 1), mode: 'sync' })
        },
      }))
      .sort((a, b) => a.tool.name.localeCompare(b.tool.name))
  }
  const status = () => ({
    enabled: enabled(),
    endpoint: '/mcp',
    transport: 'streamable-http',
    authentication: 'bearer',
    authConfigured: !!token,
    ...config.status(),
    tools: describeTools(tools()),
  })
  return {
    router: createMcpRouter({
      name: 'andera-worker',
      token: () => token,
      enabled,
      tools,
      origins: (env.MCP_ALLOWED_ORIGINS || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean),
      report: options.report,
    }),
    status,
    close: () => config.close(),
  }
}
