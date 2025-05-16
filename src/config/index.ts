export const config = {
  logLevel: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  maxLogs: parseInt(process.env.MAX_LOGS || '1000', 10),
  authKey: process.env.AUTH_KEY || '',
  lbAuthKey: process.env.LB_AUTH_KEY || '',
  group: process.env.GROUP || '',
  contract: parseInt(process.env.CONTRACT || '1', 10),
  port: parseInt(process.env.PORT || '3000', 10),
  websocketPort: parseInt(process.env.WEBSOCKET_PORT || '3001', 10),
  worker: {
    maxRetries: 1,
    slots: parseInt(process.env.SLOTS || '10', 10),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000', 10),
    webhook: {
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000', 10),
      maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '1000', 10),
      headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : {},
    },
  },
  enableOpenAPI: process.env.OPENAPI_ENABLED?.toLowerCase() === 'true',
}

function assertConfig() {
  if (!config.authKey) throw new Error('Missing AUTH_KEY in environment')
  if (!config.lbAuthKey) throw new Error('Missing LB_AUTH_KEY in environment')
  if (!config.group) throw new Error('Missing GROUP in environment')
  if (!config.port) throw new Error('Missing PORT in environment')
  if (!config.websocketPort) throw new Error('Missing WEBSOCKET_PORT in environment')
  if (config.maxLogs <= 0) throw new Error('MAX_LOGS must be > 0')
  if (config.worker.slots <= 0) throw new Error('SLOTS must be > 0')
}
assertConfig()
