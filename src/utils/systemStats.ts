import os from 'os'
import si from 'systeminformation'

export function getCpuLoad(): number {
  const cpus = os.cpus().length
  return os.loadavg()[0] / cpus
}

export async function getUsedMemoryPercent(): Promise<number> {
  const mem = await si.mem()
  return 1 - mem.available / mem.total
}
