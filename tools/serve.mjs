// 零依賴靜態伺服器。ES modules 需要 http(s) 來源，不能用 file:// 開啟。
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const PORT = Number(process.env.PORT) || 5173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/]+/, '')
    let file = join(ROOT, rel || 'index.html')
    if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden')
    const info = await stat(file).catch(() => null)
    if (info?.isDirectory()) file = join(file, 'index.html')
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    res.end(body)
  } catch {
    send(res, 404, 'Not found')
  }
})

function send(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

server.listen(PORT, () => {
  console.log(`easy-synthesis → http://localhost:${PORT}`)
})
