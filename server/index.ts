import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readEnv } from './env.ts'
import { createApiRoutes } from './routes.ts'
import { fileConfigStore } from './config-store-file.ts'

const start = (): void => {
  const env = readEnv()
  const store = fileConfigStore()
  const app = createApiRoutes(() => ({
    auth: { apiKey: env.apiKey, athleteId: env.athleteId },
    store,
  }))

  if (env.production) {
    app.use('/*', serveStatic({ root: './dist' }))
    app.get('/*', serveStatic({ path: './dist/index.html' }))
  }

  serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
    console.log(`intervals-coach api → http://localhost:${port}`)
  })
}

try {
  start()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
