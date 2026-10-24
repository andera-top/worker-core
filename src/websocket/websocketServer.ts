import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config'
import { isInMaintenance, getAvailableSlots, getUsedSlots, getMaxSlots } from '../slots/slotsManager'
import { getQueueLength } from '../slots/taskQueue'
import { log } from '../utils/logger'
import { safeEqual } from '../middleware/auth'
import { getCpuLoad, getUsedMemoryPercent } from '../utils/systemStats'
import { areAllServicesUp, getServicesHealth } from '../dynamic/resolveServices'

let wss: WebSocketServer | null = null
let broadcastRunning = false
let statusBroadcastInterval: NodeJS.Timeout | undefined

function workerStatus() {
  if (isInMaintenance()) return 'maintenance'
  return areAllServicesUp() ? 'ready' : 'unavailable'
}

export function startWebSocketServer() {
  wss = new WebSocketServer({
    port: config.websocketPort,
    maxPayload: 1024,
    verifyClient: ({ req }: { req: import('http').IncomingMessage }) => safeEqual(req.headers['sec-websocket-protocol'], config.lbAuthKey),
  })
  if (!statusBroadcastInterval) {
    statusBroadcastInterval = setInterval(() => {
      void broadcastStatus()
    }, 1000)
  }

  wss.on('connection', (ws, req) => {
    ws.on('error', () => log('[WEBSOKET]', 'Invalid WebSocket frame; connection closed'))
    const auth = req.headers['sec-websocket-protocol']
    if (auth !== config.lbAuthKey) {
      ws.close(4001, 'Unauthorized')
      log('WebSocket rejected: bad auth key')
      return
    }

    log('[WEBSOKET]', `WebSocket connection established with Load Balancer`)

    ws.on('message', msg => {
      const message = msg.toString()
      if (message === 'ping') {
        ws.send(
          JSON.stringify({
            status: workerStatus(),
            slots: {
              used: getUsedSlots(),
              available: getAvailableSlots(),
              limit: getMaxSlots(),
              queue: getQueueLength(),
            },
          })
        )
      }
    })
  })

  log('[WEBSOKET]', `WebSocket server listening on port ${config.websocketPort}`)
}

export async function broadcastStatus() {
  if (!wss || broadcastRunning) return
  broadcastRunning = true
  try {
    const usedMemoryPercent = await getUsedMemoryPercent()
    const status = JSON.stringify({
      status: workerStatus(),
      slots: {
        used: getUsedSlots(),
        available: getAvailableSlots(),
        limit: getMaxSlots(),
        queue: getQueueLength(),
      },
      system: {
        uptime: process.uptime(),
        cpuLoad: getCpuLoad(),
        usedMemoryPercent: Math.round(usedMemoryPercent * 1000) / 10,
      },
      services: getServicesHealth(),
    })

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(status)
    }
  } catch (err) {
    log('[WEBSOKET]', 'Unable to broadcast Worker status:', err)
  } finally {
    broadcastRunning = false
  }
}
