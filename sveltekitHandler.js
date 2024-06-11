import { Readable } from 'node:stream'
import { splitCookiesString } from 'set-cookie-parser'

const lambdaHandler = async (event, context, { signal }) => {
  const { server, env } = context
  const { headers, rawQueryString, body: rawBody, isBase64Encoded } = event
  const { method, path } = event.requestContext.http

  // Override origin
  headers.origin = process.env.ORIGIN ?? headers.origin

  const queryString = rawQueryString ? `?${rawQueryString}` : ''
  const url = `${headers.origin}${path}${queryString}`

  const encoding = isBase64Encoded
    ? 'base64'
    : headers['content-encoding'] ?? 'utf-8'
  const body =
    typeof rawBody === 'string' ? Buffer.from(rawBody, encoding) : rawBody

  const rendered = await server.respond(
    new Request(url, {
      method,
      headers: new Headers(headers),
      body
    }),
    {
      getClientAddress() {
        console.log('getClientAddress', headers['x-forwarded-for'])
        return headers['x-forwarded-for']
      }
    }
  )

  if (rendered) {
    const response = {
      statusCode: rendered.status,
      headers: {
        'cache-control': 'no-cache'
      },
      multiValueHeaders: {},
      body: Readable.from(rendered.body ?? '')
    }

    for (const [key, value] of rendered.headers.entries()) {
      if (key === 'set-cookie') {
        response.multiValueHeaders[key] = setCookie.splitCookiesString(value)
      } else if (key === 'x-sveltekit-page') {
        // excluded, security
      } else {
        response.headers[key] = value
      }
    }

    return response
  }

  return {
    statusCode: 404
  }
}
export default lambdaHandler
