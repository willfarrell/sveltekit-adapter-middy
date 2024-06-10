import middy from '@middy/core'

import sveltekitMiddleware from './sveltekitMiddleware.js'
import sveltekitHandler from './sveltekitHandler.js'

export const handler = middy({ streamifyResponse: true })
  .use([
    // other middleware here
    sveltekitMiddleware()
  ])
  .handler(sveltekitHandler)
