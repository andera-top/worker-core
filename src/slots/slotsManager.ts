import { processQueue, getQueueLength } from './taskQueue'
import { areAllServicesUp } from '../dynamic/resolveServices'
import { broadcastStatus } from '../websocket/websocketServer'

let maxSlots = 10
let usedSlots = 0
let inMaintenance = false

export function configureSlots(limit: number) {
  maxSlots = limit
}

export function enableMaintenance() {
  inMaintenance = true
  broadcastStatus()
}

export function disableMaintenance() {
  inMaintenance = false
  broadcastStatus()
}

export function isInMaintenance() {
  return inMaintenance
}

export function acquire(): boolean {
  if (!areAllServicesUp()) return false
  if (inMaintenance || usedSlots >= maxSlots) return false
  usedSlots++
  broadcastStatus()
  return true
}

export function release() {
  if (usedSlots > 0) usedSlots--
  broadcastStatus()
  if (getQueueLength() > 0) {
    processQueue()
  }
}

export function getAvailableSlots(): number {
  return inMaintenance ? 0 : maxSlots - usedSlots
}

export function getUsedSlots(): number {
  return usedSlots
}

export function getMaxSlots(): number {
  return maxSlots
}
