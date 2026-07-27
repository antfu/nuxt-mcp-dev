import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViteDevServer } from 'vite'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import DEBUG from 'debug'

const debug = DEBUG('vite:mcp:server')

interface McpSession {
  transport: SSEServerTransport
  server: McpServer
}

export async function setupRoutes(
  base: string,
  createMcpServer: () => Promise<McpServer>,
  vite: ViteDevServer,
): Promise<void> {
  const sessions = new Map<string, McpSession>()

  vite.middlewares.use(`${base}/sse`, async (req, res) => {
    try {
      const transport = new SSEServerTransport(`${base}/messages`, res)
      // One McpServer per connection: the SDK's Protocol owns a single transport per instance
      // and throws on a second connect, so a single shared server rejects every client after
      // the first. In dev an editor and one or more CLI agents legitimately attach at once.
      const server = await createMcpServer()
      sessions.set(transport.sessionId, { transport, server })
      debug('SSE Connected %s', transport.sessionId)
      res.on('close', () => {
        sessions.delete(transport.sessionId)
        Promise.resolve(server.close()).catch(error => debug('Close failed %o', error))
      })
      // A caller-supplied `mcpServer` option may still hand back a shared instance, which can
      // only hold one transport; let the newest client take over rather than throw.
      if (server.server.transport)
        await server.close()
      await server.connect(transport)
    }
    catch (error) {
      // Without this, the rejection escapes as an unhandledRejection and can take the whole dev
      // server down, instead of failing just the one connection that could not be established.
      debug('SSE connect failed %o', error)
      if (!res.headersSent)
        res.statusCode = 500
      res.end(String(error))
    }
  })

  vite.middlewares.use(`${base}/messages`, async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const query = new URLSearchParams(req.url?.split('?').pop() || '')
    const clientId = query.get('sessionId')

    if (!clientId || typeof clientId !== 'string') {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }

    const session = sessions.get(clientId)
    if (!session) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    debug('Message from %s', clientId)
    await session.transport.handlePostMessage(req, res)
  })
}
