import { Request, Response, NextFunction } from 'express'
import { config } from '../config'

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
      if (authKey === config.authKey) return next()
    } else if (options.type === 'lb') {
      if (lbAuth === config.lbAuthKey) return next()
    } else if (options.type === 'both') {
      if (lbAuth !== undefined) {
        if (authKey === config.authKey && lbAuth === config.lbAuthKey) return next()
      } else {
        if (authKey === config.authKey) return next()
      }
    } else if (options.type === 'any') {
      if (authKey === config.authKey || lbAuth === config.lbAuthKey) return next()
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
