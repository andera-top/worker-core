import os from 'os'
import si from 'systeminformation'

export function getCpuLoad(): number {
  const cpus = os.cpus().length
  return cpus > 0 ? os.loadavg()[0] / cpus : 0
}

export async function getUsedMemoryPercent(): Promise<number> {
  try {
    const mem = await si.mem()
    return mem.total > 0 ? 1 - mem.available / mem.total : 0
  } catch {
    return 0
  }
}
