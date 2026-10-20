import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function serveBuild(
  root = fileURLToPath(new URL('../frontend/dist/', import.meta.url)),
  port = 0,
) {
  const config = JSON.parse(
    await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  )
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      )
      for (const rule of config.headers) {
        if (new RegExp(`^${rule.source}$`).test(pathname))
          for (const header of rule.headers)
            res.setHeader(header.key, header.value)
      }
      const target = path.resolve(
        root,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      )
      if (
        !target.startsWith(path.resolve(root) + path.sep) ||
        !(await stat(target)).isFile()
      )
        throw new Error('missing')
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.woff2': 'font/woff2',
          '.ogg': 'audio/ogg',
          '.mp3': 'audio/mpeg',
        }[path.extname(target)] ?? 'application/octet-stream',
      )
      res.end(await readFile(target))
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
