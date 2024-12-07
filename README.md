<div align="center">
  <h1>Middy SvelteKit Adapter</h1>
  <img alt="Middy logo" src="https://raw.githubusercontent.com/middyjs/middy/main/docs/img/middy-logo.svg"/>
  <p><strong>SvelteKit adapter for AWS Lambda using Middy</strong></p>
<p>
  <a href="https://www.npmjs.com/package/@middy/http-router?activeTab=versions">
    <img src="https://badge.fury.io/js/%40middy%2Fhttp-router.svg" alt="npm version" style="max-width:100%;">
  </a>
  <a href="https://packagephobia.com/result?p=@middy/http-router">
    <img src="https://packagephobia.com/badge?p=@middy/http-router" alt="npm install size" style="max-width:100%;">
  </a>
  <a href="https://github.com/middyjs/middy/actions/workflows/tests.yml">
    <img src="https://github.com/middyjs/middy/actions/workflows/tests.yml/badge.svg?branch=main&event=push" alt="GitHub Actions CI status badge" style="max-width:100%;">
  </a>
  <br/>
   <a href="https://standardjs.com/">
    <img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="Standard Code Style"  style="max-width:100%;">
  </a>
  <a href="https://snyk.io/test/github/middyjs/middy">
    <img src="https://snyk.io/test/github/middyjs/middy/badge.svg" alt="Known Vulnerabilities" data-canonical-src="https://snyk.io/test/github/middyjs/middy" style="max-width:100%;">
  </a>
  <a href="https://github.com/middyjs/middy/actions/workflows/sast.yml">
    <img src="https://github.com/middyjs/middy/actions/workflows/sast.yml/badge.svg
?branch=main&event=push" alt="CodeQL" style="max-width:100%;">
  </a>
  <a href="https://bestpractices.coreinfrastructure.org/projects/5280">
    <img src="https://bestpractices.coreinfrastructure.org/projects/5280/badge" alt="Core Infrastructure Initiative (CII) Best Practices"  style="max-width:100%;">
  </a>
  <br/>
  <a href="https://gitter.im/middyjs/Lobby">
    <img src="https://badges.gitter.im/gitterHQ/gitter.svg" alt="Chat on Gitter" style="max-width:100%;">
  </a>
  <a href="https://stackoverflow.com/questions/tagged/middy?sort=Newest&uqlId=35052">
    <img src="https://img.shields.io/badge/StackOverflow-[middy]-yellow" alt="Ask questions on StackOverflow" style="max-width:100%;">
  </a>
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
