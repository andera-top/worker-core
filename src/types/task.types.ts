export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type ParamSchema = {
  type: ParamType
  description?: string
  required?: boolean
  default?: any
  enum?: any[]
  pattern?: string
  min?: number
  max?: number
}

export type ReturnMode = 'sync' | 'stream' | 'webhook'

export type FunctionConfig = {
  timeout?: number
  maxRetries?: number
  supportsStreaming?: boolean
  logResult?: boolean
}

export type FunctionContext = {
  /** Aborted when this execution attempt reaches its timeout. */
  signal: AbortSignal
  stream?: (chunk: string) => void
  webhook?: string
}

export type FunctionDefinition = {
  description?: string
  /** Omit for a function that takes no parameters. */
  params?: { [key: string]: ParamSchema }
  config?: FunctionConfig
  handler: (params: any, context?: FunctionContext) => Promise<any>
}
