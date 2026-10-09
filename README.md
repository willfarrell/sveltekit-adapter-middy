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
  - `ssm`/`secrets-manager`
- Removes `x-sveltekit-page` headers
- Multiple `Set-Cookies`
- Trusted request origin via `HEADER_ORIGIN`, keeping SvelteKit's CSRF check intact
- Lambda event and context available as `platform`

Note: Bring your own deployment.

## Getting started

```bash
npm i -D sveltekit-adapter-middy @middy/core
```

Requires SvelteKit 3, Middy 8, and Node.js 26 (to build and as the Lambda runtime). `@middy/core` is a peer dependency: the handler is bundled from your project, so it uses your copy.

As of October 2026, the Lambda `nodejs26.x` runtime is in public preview, which AWS says not to use for production. Until it's generally available, you can set `esbuildOptions: { target: 'node24' }` and deploy on `nodejs24.x`.

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite'
import adapter from 'sveltekit-adapter-middy'

export default {
  plugins: [
    sveltekit({
      adapter: adapter({
        // options
      })
    })
  ]
}
```

### Options

- `handlerPath` (string): Relative path to handler override file. Overriding allows you to add in Content-Encoding, Security Headers, and pass in secrets more securely. Defaults to the built-in minimalist handler. See [Handler resolution](#handler-resolution).
- `out` (string): Relative path to build dir. Defaults to `build`
- `esbuildOptions` (object): `esbuild` option overrides. See [`index.js`](index.js) for defaults (ESM bundle targeting `node26`).
- `split` (object): Route splitting, `name` to route prefix. Defaults to `{}` (single lambda). `index` is reserved for the remainder lambda.

### Request details

- `getClientAddress()` returns `requestContext.http.sourceIp`, the TCP peer, unless `XFF_DEPTH` is set. A Function URL is public, so anyone can call it with their own `x-forwarded-for`. Set `XFF_DEPTH` to the number of trusted proxies in front of the lambda (`1` for CloudFront) to use the entry that many places from the right. Only do this when those proxies are the only way in, eg the Function URL uses `AWS_IAM` auth with CloudFront origin access control.
- `platform` is `{ event, context }`: the Function URL event and the Lambda context, including anything middleware added (eg `ssm` with `setToContext`). Read it as `event.platform` in hooks, `load` and actions, and type it by declaring `App.Platform` in `src/app.d.ts`.
- `HEADER_ORIGIN` should be the origin browsers use, eg `https://example.com`. Without it the url origin comes from the `host` header, which behind CloudFront is the Function URL domain, so every form post fails the CSRF check. A warning is logged at cold start when it's unset.
- `read()` from `$app/server` is not supported. Static assets are written to `out/assets` for S3/CloudFront rather than bundled into the lambda, so there's no file for it to read. Using it fails the build rather than the request.
- A body on a `GET` or `HEAD` is dropped; `Request` refuses to carry one.
- Function URLs move the `cookie` header into `event.cookies`; it's joined back into `cookie` for SvelteKit.
- `request.signal` aborts when Middy's early timeout fires, so fetches in `load` can stop work the response will never carry.
- AWS documents the query string characters Function URLs support as `a-z A-Z 0-9 . _ - % & = +`, which leaves out a raw `/`. `sveltekitMiddleware` encodes the `?/action` form action URLs SvelteKit renders. Encode any `/` in your own query strings, eg `?redirectTo=%2Fadmin`, or in `fetch('?/action')` calls from client code.

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

When prefixes overlap, the longest string prefix wins, so `/admin/reports` beats `/admin` whatever the key order. Function prefixes are tried after every string prefix, in the order given. An entry that matches no routes logs a warning; it's usually a typo, such as a trailing `/`.

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
    // `event.platform.context.dbUrl` in hooks, `load` and actions
    ssm({ fetchData: { dbUrl: '/app/admin/db-url' }, setToContext: true }),
    sveltekitMiddleware()
  ])
  .handler(sveltekitHandler)
```

Notes:

- Keep `sveltekitMiddleware()` last in `.use([...])`. Middy runs `after` hooks in reverse order, so it then rewrites the html before anything else sees it. Compression from `http-content-encoding` listed after it would run first, and the rewrite would corrupt the compressed bytes.
- Handler files are copied into the build directory before bundling, so `./sveltekitHandler.js` and `./sveltekitMiddleware.js` resolve there, not next to your source file. Importing your own project code by relative path won't resolve; bare package specifiers are fine.
- A `handlerPath` that doesn't exist throws rather than silently falling back.
- Prefixes match route ids, so layout groups are ignored: `src/routes/(app)/admin/handler.js` serves prefix `/admin`.
- A function prefix has no route directory, so it never picks up a route-local `handler.js`. Give it a `handlerPath`.
- SvelteKit ignores non-`+` files in the routes directory, so a colocated `handler.js` doesn't become a route.

## Recommended Infrastructure

- CloudFront: Route to static assets / pages, with fallback to server side rendering
- S3: store static assets and pages
- Lambda Function URL: server side rendering, with `AWS_IAM` auth and CloudFront origin access control so CloudFront is the only way in

## Upgrading to 0.5

This release requires SvelteKit 3, Middy 8, and Node.js 26; use 0.4 for SvelteKit 2. `@middy/core` is now a peer dependency, so install it in your project: `npm i -D @middy/core`.

Changes that need action:

- **Set `XFF_DEPTH=1` behind CloudFront.** `getClientAddress()` now ignores `x-forwarded-for` unless `XFF_DEPTH` is set, because anyone calling the Function URL directly could forge it. Without it you get CloudFront's edge ip.

Fixes that change behaviour:

- Lambda event and context now reach SvelteKit as `platform`, so values middleware puts on the context are usable in hooks, `load` and actions.
- esbuild warnings and errors are reported through the SvelteKit build log, once.
- Request cookies now reach SvelteKit. They arrive in `event.cookies` and were previously dropped.
- Streamed pages flush their shell as soon as it renders, instead of waiting for the next chunk.
- An html response with no body (`HEAD`, `204`) no longer crashes the lambda.
- Overlapping split prefixes resolve to the longest one rather than the first declared.
- A `handler.js` in a root layout group (`src/routes/(app)/handler.js`) now serves prefix `/`.

Types now ship with the package.

The server is now built with `builder.generateServerInstance`, so the build directory has `server.js` (exporting a ready `server`) in place of `manifest.js`. The bundled `sveltekitMiddleware.js` already uses it; a custom handler that imported `./manifest.js` or `Server` from `./index.js` should import `{ server }` from `./server.js` instead.

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
