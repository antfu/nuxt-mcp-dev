import type { Nitro } from 'nitropack'
import type { Unimport } from 'unimport'
import type { ViteMcpOptions } from 'vite-plugin-mcp'
import type { McpToolContext } from './types'
import { addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import { ViteMcp } from 'vite-plugin-mcp'
import { promptNuxtBasic } from './prompts/basic'
import { useToolsRuntime } from './tools/runtime'
import { toolsScaffold } from './tools/scaffold'

export interface ModuleOptions extends ViteMcpOptions {
  /**
   * Includes the online Nuxt MCP server from https://nuxt.com/mcp
   *
   * This MCP would provide information about the Nuxt ecosystem, including
   * the latest documentation, available modules, etc.
   *
   * @default true
   */
  includeNuxtDocsMcp?: boolean
}

export interface ModuleHooks {
  'mcp:setup': (context: McpToolContext) => void
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-mcp-dev',
    configKey: 'mcp',
  },
  defaults: {
    includeNuxtDocsMcp: true,
  },
  async setup(options, nuxt) {
    const unimport = promiseWithResolve<Unimport>()
    const nitro = promiseWithResolve<Nitro>()
    const { registerTools } = useToolsRuntime()

    nuxt.hook('imports:context', (_unimport) => {
      unimport.resolve(_unimport)
    })
    nuxt.hook('nitro:init', (_nitro) => {
      nitro.resolve(_nitro)
    })

    addVitePlugin(ViteMcp({
      updateConfigServerName: 'nuxt',
      ...options,
      updateConfigAdditionalServers: [
        ...options.updateConfigAdditionalServers || [],
        ...(
          options.includeNuxtDocsMcp
            ? [{
                name: 'nuxt-docs',
                url: 'https://nuxt.com/mcp',
              }]
            : []),
      ],
      port: options.port || nuxt.options.devServer.port,
      async mcpServerSetup(mcp, vite) {
        await options.mcpServerSetup?.(mcp, vite)

        const context: McpToolContext = {
          unimport: unimport.promise,
          nitro: nitro.promise,
          nuxt,
          vite,
          mcp,
        }

        promptNuxtBasic(context)
        registerTools(context)
        toolsScaffold(context)

        // eslint-disable-next-line ts/ban-ts-comment
        // @ts-ignore skip type infer
        await nuxt.callHook('mcp:setup', context)
      },
    }), { client: true, server: false })
  },
})

function promiseWithResolve<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve: (value: T) => void = undefined!
  const promise = new Promise<T>((_resolve) => {
    resolve = _resolve
  })
  return { promise, resolve }
}

declare module 'nuxt/schema' {
  interface NuxtHooks {
    'mcp:setup': (ctx: McpToolContext) => void | Promise<void>
  }
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'mcp:setup': (ctx: McpToolContext) => void | Promise<void>
  }
}
