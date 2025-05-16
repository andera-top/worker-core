import { getLoadedFunctions } from '../app'
import { FunctionDefinition, ParamSchema, ParamType } from '../types/task.types'

function paramTypeToOpenAPI(type: ParamType) {
  switch (type) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object':
      return { type: 'object' }
    case 'array':
      return { type: 'array' }
    default:
      return { type: 'string' }
  }
}

function paramsToOpenAPI(params: { [key: string]: ParamSchema }) {
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const [name, def] of Object.entries(params)) {
    const prop: any = paramTypeToOpenAPI(def.type)
    if (def.default !== undefined) prop.default = def.default
    if (def.enum) prop.enum = def.enum
    if (def.pattern) prop.pattern = def.pattern
    if (def.min !== undefined) {
      if (def.type === 'number') prop.minimum = def.min
      if (def.type === 'string' || def.type === 'array') prop.minLength = def.min
    }
    if (def.max !== undefined) {
      if (def.type === 'number') prop.maximum = def.max
      if (def.type === 'string' || def.type === 'array') prop.maxLength = def.max
    }
    properties[name] = prop
    if (def.required) required.push(name)
  }
  return { properties, required }
}

export function getOpenAPISpec() {
  const functions = getLoadedFunctions() || new Map()
  const oneOfSchemas = []
  for (const [name, def] of functions.entries() as IterableIterator<[string, FunctionDefinition]>) {
    const { properties, required } = paramsToOpenAPI(def.params)
    oneOfSchemas.push({
      title: name,
      type: 'object',
      properties: { function: { type: 'string', enum: [name] }, ...properties },
      required: ['function', ...required],
    })
  }

  const paths = {
    '/task': {
      post: {
        tags: ['task'],
        summary: 'Call a worker function',
        parameters: [
          {
            name: 'Authorization',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Bearer token for authentication',
          },
          {
            name: 'x-lb-auth',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Additional header for authentication from a Load Balancer',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: oneOfSchemas,
              },
            },
          },
        },
        responses: {
          200: { description: 'Success' },
        },
      },
    },
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'Worker API',
      version: '1.0.0',
    },
    paths,
  }
}
