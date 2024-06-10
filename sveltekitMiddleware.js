import { createTransformStream } from '@datastream/core'
import { Server } from './index.js'
import { manifest } from './manifest.js'

const server = new Server(manifest)
const init = server.init({ env: process.env })

// TODO replace with @datastream/string
export const stringReplaceStream = (options, streamOptions) => {
  const { pattern, replacement } = options
  let previousChunk = ''
  const transform = (chunk, enqueue) => {
    const newChunk = (previousChunk + chunk).replace(pattern, replacement)
    enqueue(newChunk.substring(0, previousChunk.length))
    previousChunk = newChunk.substring(previousChunk.length)
  }
  const flush = (enqueue) => {
    enqueue(previousChunk)
  }
  return createTransformStream(transform, flush, streamOptions)
}

const formActionPattern = /action="\?\//g
const formActionReplacement = 'action="?%2F'
const sveltekitMiddleware = () => {
  const sveltekitMiddlewareBefore = async (request) => {
    request.context.server = server
    await init
  }

  const sveltekitMiddlewareAfter = async (request) => {
    // Workaround: AWS Function URLs doesn't support querystring keys that contain `/`
    if (request.response['Content-Type'].inlcudes('text/html')) {
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
