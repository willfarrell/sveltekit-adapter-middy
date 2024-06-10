import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const name = '@middy/sveltekit'
const files = fileURLToPath(new URL('./', import.meta.url).href)

const sveltekitAdapterMiddy = (opts = {}) => {
  const {
    out = 'build',
    handlerPath = `${files}/handler.js`,
    esbuildOptions = {}
  } = opts

  return {
    name,
    async adapt(builder) {
      const tmp = builder.getBuildDirectory('adapter-middy')

      builder.rimraf(out)
      builder.rimraf(tmp)

      builder.log.minor('Copying static assets')
      const clientFiles = await builder.writeClient(
        `${out}/assets${builder.config.kit.paths.base}`
      )

      builder.log.minor('Building server')
      await builder.writeServer(tmp)
      writeFileSync(
        `${tmp}/manifest.js`,
        [
          `export const manifest = ${builder.generateManifest({
            relativePath: './'
          })};`,
          `export const prerendered = new Set(${JSON.stringify(
            builder.prerendered.paths
          )});`,
          `export const base = ${JSON.stringify(
            builder.config.kit.paths.base
          )};`
        ].join('\n\n')
      )

      builder.copy(
        `${files}/sveltekitMiddleware.js`,
        `${tmp}/sveltekitMiddleware.js`
      )
      builder.copy(`${files}/sveltekitHandler.js`, `${tmp}/sveltekitHandler.js`)
      builder.copy(handlerPath, `${tmp}/handler.js`)

      try {
        const result = await esbuild.build({
          target: 'node20',
          bundle: true,
          platform: 'node',
          format: 'esm',
          treeShaking: true,
          ...esbuildOptions,
          entryPoints: [`${tmp}/handler.js`],
          outfile: `${out}/index.mjs`,
          external: ['node:*', ...(esbuildOptions?.external ?? [])]
        })

        if (result.warnings.length > 0) {
          const formatted = await esbuild.formatMessages(result.warnings, {
            kind: 'warning',
            color: true
          })

          console.error(formatted.join('\n'))
        }
      } catch (err) {
        const formatted = await esbuild.formatMessages(err.errors, {
          kind: 'error',
          color: true
        })

        console.error(formatted.join('\n'))

        throw new Error(
          `Bundling with esbuild failed with ${err.errors.length} ${
            err.errors.length === 1 ? 'error' : 'errors'
          }`
        )
      }

      builder.log.minor('Prerendering static pages')
      const prerenderedFiles = await builder.writePrerendered(
        `${out}/prerendered${builder.config.kit.paths.base}`
      )
    },
    supports: {
      read: () => true
    }
  }
}
export default sveltekitAdapterMiddy
