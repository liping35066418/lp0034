import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { initDatabase } from './db/database.js'
import { initStorage } from './services/FileManager.js'

import uploadRoutes from './routes/upload.js'
import materialRoutes from './routes/materials.js'
import aiRoutes from './routes/ai.js'
import renderRoutes from './routes/render.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

initDatabase()
initStorage()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

app.use('/api/upload', uploadRoutes)
app.use('/api/materials', materialRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/render', renderRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
      timestamp: Date.now(),
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
    message: error.message,
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
    path: req.path,
  })
})

export default app
