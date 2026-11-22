import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mock-cloudflare-files-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/files/view-urls')) {
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ urls: {}, expiresIn: 600 }))
            return
          }
          if (req.url?.startsWith('/api/files/upload-url')) {
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({
              key: 'dev-mock-key',
              uploadUrl: 'http://localhost:5173/api/files/mock-upload',
              headers: {}
            }))
            return
          }
          next()
        })
      }
    }
  ]
})

