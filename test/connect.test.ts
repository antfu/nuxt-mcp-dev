import type { ViteDevServer } from 'vite'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it } from 'vitest'
import { ViteMcp } from '../packages/vite-plugin-mcp/src/index'

type SseHandler = (req: any, res: any) => Promise<void>

function createFakeRes() {
  const listeners: Record<string, (() => void)[]> = {}
  const res = {
    headersSent: false,
    statusCode: 200,
    status: undefined as number | undefined,
    body: undefined as string | undefined,
    writeHead(status: number) {
      res.status = status
      res.headersSent = true
      return res
    },
    write: () => true,
    end(body?: string) {
      res.body = body ?? ''
    },
    on(event: string, cb: () => void) {
      ;(listeners[event] ||= []).push(cb)
    },
    close() {
      for (const cb of listeners.close || [])
        cb()
    },
  }
  return res
}

async function setup(mcpServer: () => McpServer) {
  const routes = new Map<string, SseHandler>()
  const vite = {
    middlewares: { use: (path: string, handler: SseHandler) => routes.set(path, handler) },
    config: { server: { port: 5173, https: false }, root: process.cwd(), logger: { info() {}, error() {} } },
  } as unknown as ViteDevServer

  const plugin = ViteMcp({ printUrl: false, updateConfig: false, mcpServer: async () => mcpServer() })
  await (plugin.configureServer as any).call({}, vite)

  return routes.get('/__mcp/sse')!
}

// A live transport means that server instance is currently connected. The SDK's Protocol keeps
// it on the inner `server`, not on the McpServer wrapper.
function isConnected(server: McpServer) {
  return Boolean(server.server.transport)
}

describe('setupRoutes', () => {
  it('serves concurrent clients, one server instance each', async () => {
    const created: McpServer[] = []
    const sse = await setup(() => {
      const server = new McpServer({ name: 'test', version: '0.0.0' })
      created.push(server)
      return server
    })

    const first = createFakeRes()
    await sse({}, first)
    const second = createFakeRes()
    await sse({}, second)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(created).toHaveLength(2)
    // Before this, a single shared server threw "Already connected to a transport" and the
    // second client got nothing.
    expect(created.filter(isConnected)).toHaveLength(2)
  })

  it('drops only the disconnecting client', async () => {
    const created: McpServer[] = []
    const sse = await setup(() => {
      const server = new McpServer({ name: 'test', version: '0.0.0' })
      created.push(server)
      return server
    })

    const first = createFakeRes()
    await sse({}, first)
    const second = createFakeRes()
    await sse({}, second)

    first.close()
    await new Promise(resolve => setImmediate(resolve))

    expect(isConnected(created[0])).toBe(false)
    expect(isConnected(created[1])).toBe(true)
  })

  it('lets the newest client take over a caller-supplied shared server', async () => {
    const shared = new McpServer({ name: 'shared', version: '0.0.0' })
    const sse = await setup(() => shared)

    const first = createFakeRes()
    await sse({}, first)
    const second = createFakeRes()
    await sse({}, second)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(isConnected(shared)).toBe(true)
  })

  it('fails one connection instead of rejecting unhandled', async () => {
    const sse = await setup(() => {
      throw new Error('boom')
    })

    const res = createFakeRes()
    await expect(sse({}, res)).resolves.toBeUndefined()
    expect(res.statusCode).toBe(500)
    expect(res.body).toContain('boom')
  })
})
