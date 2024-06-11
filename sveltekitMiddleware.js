import { stringReplaceStream } from '@datastream/string'
import { Server } from './index.js'
import { manifest } from './manifest.js'

const server = new Server(manifest)
const init = server.init({ env: process.env })

const formActionPattern = /action="\?\//g
const formActionReplacement = 'action="?%2F'
const sveltekitMiddleware = () => {
  const sveltekitMiddlewareBefore = async (request) => {
    request.context.server = server
    await init
  }

  const sveltekitMiddlewareAfter = async (request) => {
    // Workaround: AWS Function URLs doesn't support querystring keys that contain `/`
    if (request.response.headers?.['content-type'].includes('text/html')) {
      const stream = stringReplaceStream({
        pattern: formActionPattern,
        replacement: formActionReplacement
      })
      request.response.body.pipe(stream)
    }
  }
  return {
    before: sveltekitMiddlewareBefore,
    after: sveltekitMiddlewareAfter
  }
}
export default sveltekitMiddleware
