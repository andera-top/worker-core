export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type ParamSchema = {
  type: ParamType
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

export type FunctionDefinition = {
  params: { [key: string]: ParamSchema }
  config?: FunctionConfig
  handler: (
    params: any,
    context?: {
      stream?: (chunk: string) => void
    }
  ) => Promise<any>
}
