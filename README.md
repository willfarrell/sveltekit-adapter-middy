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
- Override `Origin` header with `ORIGIN` env

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

- `handlerPath` (string): Relative path to handler override file. Overriding allows you to add in Content-Encoding, Security Headers, and pass in secrets more securely. Defaults to build-in minimalist handler.
- `out` (string): Relative path to build dir. Defaults to `build`
- `esbuildOptions` (object): `esbuild` option overrides. See [code]() for defaults.

## Recommended Infrastructure

- CloudFront: Route to static assets / pages, with fallback to server side rendering
- S3: store static assets and pages
- Lambda Function URL: server side rendering

## Roadmap

- infra diagram
- cli to sync static assets to S3 w/ headers
- LLRT

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2017-2024 [Luciano Mammino](https://github.com/lmammino), [will Farrell](https://github.com/willfarrell), and the [Middy team](https://github.com/middyjs/middy/graphs/contributors).

<a href="https://app.fossa.io/projects/git%2Bgithub.com%2Fmiddyjs%2Fmiddy?ref=badge_large">
  <img src="https://app.fossa.io/api/projects/git%2Bgithub.com%2Fmiddyjs%2Fmiddy.svg?type=large" alt="FOSSA Status"  style="max-width:100%;">
</a>
