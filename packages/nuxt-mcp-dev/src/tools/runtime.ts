import type { Component, NuxtPage } from '@nuxt/schema'
import type { McpToolContext } from '../types'
import { useNuxt } from '@nuxt/kit'
import { z } from 'zod'

export function useToolsRuntime(): {
  registerTools: (context: McpToolContext) => void
} {
  const nuxt = useNuxt()

  let pages: NuxtPage[] = []
  nuxt.hook('pages:extend', (_pages) => {
    pages = _pages
  })

  let components: Component[] = []
  nuxt.hook('components:extend', (_components) => {
    components = _components
  })

  function registerTools({ mcp, unimport }: McpToolContext): void {
    mcp.tool(
      'get-nuxt-config',
      'Get the Nuxt configuration, including the ssr, appDir, srcDir, rootDir, alias, runtimeConfig, modules, etc.',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ssr: !!nuxt.options.ssr,
              appDir: nuxt.options.appDir,
              srcDir: nuxt.options.srcDir,
              rootDir: nuxt.options.rootDir,
              alias: nuxt.options.alias,
              runtimeConfig: {
                public: nuxt.options.runtimeConfig.public,
              },
              modules: nuxt.options._installedModules.map(i => i.meta.name || (i as any).name).filter(Boolean),
              imports: {
                autoImport: !!nuxt.options.imports.autoImport,
                ...nuxt.options.imports,
              },
              components: nuxt.options.components,
            }),
          }],
        }
      },
    )

    mcp.tool(
      'list-nuxt-auto-imports-items',
      'List auto-imports items, when importing new functions to the code, check available items from this tool.',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              items: await (await unimport).getImports(),
            }, null, 2),
          }],
        }
      },
    )

    mcp.tool(
      'list-nuxt-components',
      'List registered components in the Nuxt app. When adding importing new components, check available components from this tool.',
      {
        filter: z.string()
          .optional()
          .describe('Filter components by name (case-insensitive substring match)'),
        page: z.number()
          .int()
          .min(1)
          .optional()
          .describe('Page number, starts from 1 (default: 1)'),
        pageSize: z.number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Number of components per page (default: 50, max: 200)'),
      },
      async ({ filter, page = 1, pageSize = 50 }) => {
        let filtered = components

        if (filter) {
          const keyword = filter.toLowerCase()
          filtered = filtered.filter(c =>
            c.pascalName?.toLowerCase().includes(keyword)
            || c.kebabName?.toLowerCase().includes(keyword),
          )
        }

        const total = filtered.length
        const totalPages = Math.ceil(total / pageSize)
        const start = (page - 1) * pageSize
        const paginated = filtered.slice(start, start + pageSize)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              components: paginated,
              pagination: { page, pageSize, total, totalPages },
            }, null, 2),
          }],
        }
      },
    )

    mcp.tool(
      'list-nuxt-pages',
      'List registered pages and their metadata in the Nuxt app.',
      {},
      async () => {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(pages, null, 2),
          }],
        }
      },
    )
  }

  return { registerTools }
}
