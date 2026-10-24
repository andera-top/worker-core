import { Request, Response, NextFunction } from 'express'
import { createHash, timingSafeEqual } from 'crypto'
import { config } from '../config'

/** Constant-time key comparison; hashing equalizes lengths. */
export function safeEqual(value: string | undefined, key: string): boolean {
  if (value === undefined || !key) return false
  const hash = (input: string) => createHash('sha256').update(input).digest()
  return timingSafeEqual(hash(value), hash(key))
}

export function requireAuth(options: { type?: 'worker' | 'lb' | 'both' | 'any'; header?: string } = { type: 'both', header: 'authorization' }) {
  if (typeof options === 'function') {
    throw new Error('requireAuth must be called as a function: requireAuth()')
  }
  return (req: Request, res: Response, next: NextFunction) => {
    let rawAuth = req.headers[options.header || 'authorization']
    let authKey = typeof rawAuth === 'string' ? rawAuth : undefined
    if (authKey && authKey.startsWith('Bearer ')) authKey = authKey.slice(7).trim()
    let lbAuth = typeof req.headers['x-lb-auth'] === 'string' ? (req.headers['x-lb-auth'] as string) : undefined
    if (lbAuth && lbAuth.startsWith('Bearer ')) lbAuth = lbAuth.slice(7).trim()

    if (options.type === 'worker') {
      if (safeEqual(authKey, config.authKey)) return next()
    } else if (options.type === 'lb') {
      if (safeEqual(lbAuth, config.lbAuthKey)) return next()
    } else if (options.type === 'both') {
      if (lbAuth !== undefined) {
        if (safeEqual(authKey, config.authKey) && safeEqual(lbAuth, config.lbAuthKey)) return next()
      } else {
        if (safeEqual(authKey, config.authKey)) return next()
      }
    } else if (options.type === 'any') {
      if (safeEqual(authKey, config.authKey) || safeEqual(lbAuth, config.lbAuthKey)) return next()
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
