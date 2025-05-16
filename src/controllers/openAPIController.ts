import express, { Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import { getOpenAPISpec } from '../dynamic/openapiSpec'

const router = express.Router()

router.get('/openapi', (req: Request, res: Response) => {
  const spec = getOpenAPISpec()
  res.json(spec)
})

router.use('/docs', swaggerUi.serve)
router.get('/docs', (req: Request, res: Response, next: NextFunction) => {
  const specUrl = '/openapi'
  return swaggerUi.setup(null, {
    swaggerOptions: { url: specUrl },
  })(req, res, next)
})

export default router
