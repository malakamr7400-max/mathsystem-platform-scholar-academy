import express from 'express'
import type { Request, Response } from 'express'
import { createServer as createViteServer } from 'vite'
import path from 'node:path'

const app = express()
const port = 3000
const isProd = process.env.NODE_ENV === 'production'

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.resolve(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Diagnostic Testing Platform running at http://0.0.0.0:${port}`)
  })
}

startServer()
