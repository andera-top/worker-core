export const config = {
  logLevel: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  maxLogs: Number(process.env.MAX_LOGS || '1000'),
  authKey: process.env.AUTH_KEY || '',
  lbAuthKey: process.env.LB_AUTH_KEY || '',
  group: process.env.GROUP || '',
  contract: Number(process.env.CONTRACT || '1'),
  port: Number(process.env.PORT || '3000'),
  websocketPort: Number(process.env.WEBSOCKET_PORT || '3001'),
  worker: {
    maxRetries: 1,
    slots: Number(process.env.SLOTS || '10'),
    defaultTimeout: Number(process.env.DEFAULT_TIMEOUT || '30000'),
    webhook: {
      timeout: Number(process.env.WEBHOOK_TIMEOUT || '5000'),
      maxRetries: Number(process.env.WEBHOOK_MAX_RETRIES || '3'),
      retryDelay: Number(process.env.WEBHOOK_RETRY_DELAY || '1000'),
      headers: parseWebhookHeaders(process.env.WEBHOOK_HEADERS),
    },
  },
  enableOpenAPI: process.env.OPENAPI_ENABLED?.toLowerCase() === 'true',
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '10mb',
}

function parseWebhookHeaders(value: string | undefined): Record<string, string> {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    // The parser error echoes the input, which may contain secrets.
    throw new Error('WEBHOOK_HEADERS must be valid JSON')
  }
}

/** Largest delay setTimeout accepts; larger values fire after 1ms. */
export const MAX_TIMER_DELAY = 2147483647

function assertConfig() {
  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) throw new Error('LOG_LEVEL must be debug, info, warn or error')
  if (!config.authKey || config.authKey !== config.authKey.trim()) throw new Error('Missing or invalid AUTH_KEY in environment')
  if (!config.lbAuthKey || config.lbAuthKey !== config.lbAuthKey.trim()) throw new Error('Missing or invalid LB_AUTH_KEY in environment')
  if (config.authKey === config.lbAuthKey) throw new Error('AUTH_KEY and LB_AUTH_KEY must be distinct')
  if (!config.group.trim() || config.group !== config.group.trim()) throw new Error('Missing or invalid GROUP in environment')
  if (!Number.isSafeInteger(config.contract) || config.contract < 1) throw new Error('CONTRACT must be a positive integer')
  for (const [name, value] of [
    ['PORT', config.port],
    ['WEBSOCKET_PORT', config.websocketPort],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be an integer between 1 and 65535`)
  }
  for (const [name, value] of [
    ['MAX_LOGS', config.maxLogs],
    ['SLOTS', config.worker.slots],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  }
  for (const [name, value] of [
    ['DEFAULT_TIMEOUT', config.worker.defaultTimeout],
    ['WEBHOOK_TIMEOUT', config.worker.webhook.timeout],
    ['WEBHOOK_RETRY_DELAY', config.worker.webhook.retryDelay],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY) throw new Error(`${name} must be an integer between 1 and ${MAX_TIMER_DELAY}`)
  }
  const bodyLimit = /^(\d+(?:\.\d+)?)\s*(?:b|kb|mb|gb)?$/i.exec(config.requestBodyLimit)
  if (!bodyLimit || !(Number(bodyLimit[1]) > 0)) throw new Error('REQUEST_BODY_LIMIT must be a positive size such as 10mb')
  if (!Number.isInteger(config.worker.webhook.maxRetries) || config.worker.webhook.maxRetries < 0) {
    throw new Error('WEBHOOK_MAX_RETRIES must be a non-negative integer')
  }
  if (
    !config.worker.webhook.headers ||
    typeof config.worker.webhook.headers !== 'object' ||
    Array.isArray(config.worker.webhook.headers) ||
    Object.values(config.worker.webhook.headers).some(value => typeof value !== 'string')
  ) {
    throw new Error('WEBHOOK_HEADERS must be a JSON object containing string values')
  }
}
assertConfig()
