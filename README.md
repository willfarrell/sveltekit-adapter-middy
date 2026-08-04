<div align="center">
  <h1>sveltekit-adapter-middy</h1>
  <img alt="Middy logo" src="https://raw.githubusercontent.com/middyjs/middy/main/docs/img/middy-logo.svg"/>
  <p><strong>SvelteKit adapter for AWS Lambda using Middy</strong></p>
<p>
  <a href="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/sveltekit-adapter-middy/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/sveltekit-adapter-middy"><img alt="npm version" src="https://img.shields.io/npm/v/sveltekit-adapter-middy.svg"></a>
  <a href="https://packagephobia.com/result?p=sveltekit-adapter-middy"><img src="https://packagephobia.com/badge?p=sveltekit-adapter-middy" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/sveltekit-adapter-middy"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/sveltekit-adapter-middy.svg"></a>
  <a href="https://www.npmjs.com/package/sveltekit-adapter-middy#provenance">
  <img alt="npm provenance" src="https://img.shields.io/badge/provenance-Yes-brightgreen"></a>
  <br/>
  <a href="https://scorecard.dev/viewer/?uri=github.com/willfarrell/sveltekit-adapter-middy"><img src="https://api.scorecard.dev/projects/github.com/willfarrell/sveltekit-adapter-middy/badge" alt="Open Source Security Foundation (OpenSSF) Scorecard"></a>
  <a href="https://slsa.dev"><img src="https://slsa.dev/images/gh-badge-level3.svg" alt="SLSA 3"></a>
  <a href="https://biomejs.dev"><img alt="Checked with Biome" src="https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome"></a>
  <a href="https://conventionalcommits.org"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white"></a>
</p>
<!--<p>You can read the documentation at: <a href="https://middy.js.org/docs/ssr/sveltekit">https://middy.js.org/docs/ssr/sveltekit</a></p>-->
</div>

Creates a lambda that supports a Function URL with streaming responses.

## Features

- Response Stream
- Extendable with Middy middlewares:
  - `http-content-encoding`
  - `http-security-headers`
  - `ssm`/`secrets-manger`
- Removes `x-sveltekit-page` headers
- Multiple `Set-Cookies`
- Trusted request origin via `HEADER_ORIGIN`, keeping SvelteKit's CSRF check intact

Note: Bring your own deployment.

## Getting started

```bash
npm i -D sveltekit-adapter-middy
```

```js
import adapter from 'sveltekit-adapter-middy'

export default {
  kit: {
    adapter: adapter({
      // options
    })
  }
}
```

### Options

- `handlerPath` (string): Relative path to handler override file. Overriding allows you to add in Content-Encoding, Security Headers, and pass in secrets more securely. Defaults to build-in minimalist handler. See [Handler resolution](#handler-resolution).
- `out` (string): Relative path to build dir. Defaults to `build`
- `esbuildOptions` (object): `esbuild` option overrides. See [code]() for defaults.
- `split` (object): Route splitting, `name` to route prefix. Defaults to `{}` (single lambda).

### Request details

- `getClientAddress()` returns the rightmost entry of `x-forwarded-for`, falling back to `requestContext.http.sourceIp`. CloudFront appends the viewer ip to any list a client supplies, so the rightmost entry is the one a client can't forge. This assumes exactly one trusted hop in front of the lambda — add another proxy and the trustworthy entry moves.
- `read()` from `$app/server` is not supported. Static assets are written to `out/assets` for S3/CloudFront rather than bundled into the lambda, so there's no file for it to read. Using it fails the build rather than the request.
- A body on a `GET` or `HEAD` is dropped; `Request` refuses to carry one.

### Route splitting

Build separate lambdas per route prefix, each with its own handler (and so its own middleware, IAM role, memory, and concurrency).

```js
adapter({
  split: {
    // `/admin/*` -> build/admin.mjs, using the default handler
    admin: '/admin',
    // `/api/*` -> build/api.mjs, using a custom handler
    api: { prefix: '/api', handlerPath: './lambda/api.js' }
  }
})
```

Routes not matching any prefix go to `build/index.mjs`, as before. Static assets and prerendered pages are unaffected.

Prefixes match SvelteKit **route ids**, not request paths, so param segments are written out literally:

```js
adapter({
  split: {
    // src/routes/[[lang]]/admin/**
    admin: '/[[lang]]/admin',
    // anything a prefix can't express
    api: (route) => /(^|\/)api(\/|$)/.test(route.id)
  }
})
```

Routing requests to the right lambda is up to your infrastructure (eg CloudFront behaviours per path pattern). Note a localised prefix needs a pattern per shape — `/admin*` and `/*/admin*` for an optional `[[lang]]`. A split lambda only knows its own routes, so anything else sent to it renders a 404.

### Handler resolution

Each entry picks its handler from the first of these that exists. Specific beats global, and within each tier explicit beats implicit:

1. that entry's own `handlerPath`
2. `handler.js` beside the route it serves, eg `src/routes/admin/handler.js` for prefix `/admin`
3. the top-level `handlerPath`
4. `src/handler.js`
5. the built-in minimalist handler

So a per-entry middleware stack needs no config at all — drop a `handler.js` next to the route:

```js
// src/routes/admin/handler.js — only this lambda loads these parameters
import middy from '@middy/core'
import { executionModeStreamifyResponse } from '@middy/core/StreamifyResponse'
import ssm from '@middy/ssm'
import sveltekitHandler from './sveltekitHandler.js'
import sveltekitMiddleware from './sveltekitMiddleware.js'

export const handler = middy({ executionMode: executionModeStreamifyResponse })
  .use([
    ssm({ fetchData: { dbUrl: '/app/admin/db-url' }, setToContext: true }),
    sveltekitMiddleware()
  ])
  .handler(sveltekitHandler)
```

Notes:

- Handler files are copied into the build directory before bundling, so `./sveltekitHandler.js` and `./sveltekitMiddleware.js` resolve there, not next to your source file. Importing your own project code by relative path won't resolve; bare package specifiers are fine.
- A `handlerPath` that doesn't exist throws rather than silently falling back.
- Prefixes match route ids, so layout groups are ignored: `src/routes/(app)/admin/handler.js` serves prefix `/admin`.
- SvelteKit ignores non-`+` files in the routes directory, so a colocated `handler.js` doesn't become a route.

## Recommended Infrastructure

- CloudFront: Route to static assets / pages, with fallback to server side rendering
- S3: store static assets and pages
- Lambda Function URL: server side rendering

## Upgrading to 0.4

Two behaviour changes need action:

**Set `HEADER_ORIGIN`.** It previously overwrote the client's `Origin` header and was used as the request url origin, which made SvelteKit's CSRF check compare a value against itself — cross-site form posts were never rejected. The url origin now comes from `HEADER_ORIGIN` (or `host`) and the client's header is left alone, so the check works. If `HEADER_ORIGIN` doesn't match the origin browsers actually use, your own form posts will start returning 403.

**`read()` from `$app/server` now fails the build.** It was declared as supported but never wired up, so it failed at runtime instead. If a route uses it, either drop the call or fetch the asset from your CDN.

Also: a request body arriving on a `GET`/`HEAD` is dropped rather than throwing, `content-encoding` is no longer misread as a body encoding (`gzip` threw), and `getClientAddress()` returns a single ip rather than the raw `x-forwarded-for` list.

## Roadmap

- infra diagram
- cli to sync static assets to S3 w/ headers
- LLRT

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2017-2026 [will Farrell](https://github.com/willfarrell) and the [sveltekit-adapter-middy contributors](https://github.com/willfarrell/sveltekit-adapter-middy/graphs/contributors).
