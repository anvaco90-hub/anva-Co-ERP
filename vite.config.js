import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Memory cache for mock files in local development
const mockStorage = new Map()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'cloudflare-files-dev-handler',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // 1. Request upload URL
          if (req.method === 'POST' && req.url?.startsWith('/api/files/upload-url')) {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              let parsed = {}
              try { parsed = JSON.parse(body) } catch {}
              const ym = new Date().toISOString().slice(0, 7)
              const kind = parsed.kind || 'items'
              const ext = (parsed.contentType || 'image/jpeg').split('/')[1] || 'jpg'
              const safeName = (parsed.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
              const key = `${kind}/${ym}/${Date.now()}-${safeName}.${ext}`

              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(JSON.stringify({
                key,
                uploadUrl: `/api/files/mock-storage/${encodeURIComponent(key)}`,
                headers: { 'Content-Type': parsed.contentType || 'application/octet-stream' },
                expiresIn: 300
              }))
            })
            return
          }

          // 2. PUT upload file into mock storage
          if (req.method === 'PUT' && req.url?.startsWith('/api/files/mock-storage/')) {
            const key = decodeURIComponent(req.url.replace('/api/files/mock-storage/', ''))
            const chunks = []
            req.on('data', chunk => chunks.push(chunk))
            req.on('end', () => {
              const buffer = Buffer.concat(chunks)
              const contentType = req.headers['content-type'] || 'application/octet-stream'
              mockStorage.set(key, { buffer, contentType })
              res.statusCode = 200
              res.end()
            })
            return
          }

          // 3. GET file from mock storage
          if (req.method === 'GET' && req.url?.startsWith('/api/files/mock-storage/')) {
            const key = decodeURIComponent(req.url.replace('/api/files/mock-storage/', ''))
            const file = mockStorage.get(key)
            if (file) {
              res.setHeader('Content-Type', file.contentType)
              res.setHeader('Cache-Control', 'no-cache')
              res.statusCode = 200
              res.end(file.buffer)
              return
            }
            res.statusCode = 404
            res.end('File not found in local mock storage')
            return
          }

          // 4. Request view URLs
          if (req.method === 'POST' && req.url?.startsWith('/api/files/view-urls')) {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              let parsed = {}
              try { parsed = JSON.parse(body) } catch {}
              const keys = Array.isArray(parsed.keys) ? parsed.keys : []
              const urls = {}
              keys.forEach(k => {
                // If it exists in local mock storage, serve from mock storage
                if (mockStorage.has(k)) {
                  urls[k] = `/api/files/mock-storage/${encodeURIComponent(k)}`
                } else if (/^https?:\/\//i.test(k) || /^data:/i.test(k)) {
                  urls[k] = k
                } else {
                  // Fallback url for dev mock
                  urls[k] = `/api/files/mock-storage/${encodeURIComponent(k)}`
                }
              })
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(JSON.stringify({ urls, expiresIn: 600 }))
            })
            return
          }

          // 5. Delete file
          if (req.method === 'POST' && req.url?.startsWith('/api/files/delete')) {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              let parsed = {}
              try { parsed = JSON.parse(body) } catch {}
              if (parsed.key) mockStorage.delete(parsed.key)
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true }))
            })
            return
          }

          next()
        })
      }
    }
  ]
})
