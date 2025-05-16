import axios from 'axios'
import { log } from './logger'
import { config } from '../config'

export async function sendWebhook(url: string, data: any, customHeaders?: Record<string, string>): Promise<void> {
  const { timeout, maxRetries, retryDelay, headers } = config.worker.webhook

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      await axios.post(url, data, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Andera',
          ...headers,
          ...(customHeaders || {}),
        },
      })
      log('[WEBHOOK]', `Webhook sent successfully to ${url}`)
      return
    } catch (err: any) {
      log('[WEBHOOK]', `Webhook attempt ${attempt}/${maxRetries + 1} failed:`, err.message)

      if (attempt > maxRetries) {
        throw new Error(`Failed to send webhook after ${maxRetries + 1} attempts: ${err.message}`)
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }
}
