import { acquire, release } from '../slots/slotsManager'
import { Heap } from 'heap-js'
import { getAvailableSlots } from '../slots/slotsManager'

let order = 0
let isProcessing = false

type TaskEntry = {
  priority: number
  execute: () => Promise<void>
  resolve?: () => void
  reject?: (err: any) => void
  order: number
}

const queue = new Heap<TaskEntry>((a: TaskEntry, b: TaskEntry) => {
  if (a.priority !== b.priority) return a.priority - b.priority
  return a.order - b.order
})

export function addTaskToQueue(priority: number, task: () => Promise<void>): Promise<void> {
  const taskOrder = order++
  return new Promise((resolve, reject) => {
    queue.push({ priority, execute: task, resolve, reject, order: taskOrder })
    processQueue()
  })
}

export async function processQueue() {
  if (isProcessing) return
  isProcessing = true
  try {
    while (!queue.isEmpty() && getAvailableSlots() > 0) {
      if (acquire()) {
        const next = queue.pop()
        if (next) {
          next
            .execute()
            .then(() => next.resolve && next.resolve())
            .catch(err => next.reject && next.reject(err))
            .finally(() => {
              release()
            })
        }
      } else {
        break
      }
    }
  } finally {
    isProcessing = false
  }
}

export function getQueueLength(): number {
  return queue.size()
}

export function getQueueSnapshot(): { priority: number; order: number }[] {
  return queue.toArray().map(({ priority, order }) => ({ priority, order }))
}
