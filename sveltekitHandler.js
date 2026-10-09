// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { Readable } from "node:stream";

const lambdaHandler = async (event, context, { signal }) => {
	const { server } = context;
	const {
		headers,
		cookies,
		rawQueryString,
		body: rawBody,
		isBase64Encoded,
	} = event;
	const { method, path, sourceIp } = event.requestContext.http;

	// The url origin must come from a trusted source. SvelteKit's CSRF check
	// rejects form posts where the `origin` header doesn't match `url.origin`,
	// so deriving one from the other would make the check unfailable. Set
	// `HEADER_ORIGIN` in production; `host` is only as trustworthy as what fronts it.
	const origin =
		process.env.HEADER_ORIGIN ?? `https://${headers.host ?? "example.com"}`;

	const queryString = rawQueryString ? `?${rawQueryString}` : "";
	const url = `${origin}${path}${queryString}`;

	// `content-encoding` is a compression scheme, not a Buffer encoding
	const body =
		isBase64Encoded && rawBody ? Buffer.from(rawBody, "base64") : rawBody;

	const requestHeaders = new Headers(headers);
	// Function URLs move the `cookie` header into `event.cookies`
	if (cookies?.length) requestHeaders.set("cookie", cookies.join("; "));

	// Anyone can call a public Function URL with their own `x-forwarded-for`, so
	// only the `XFF_DEPTH` entries appended by trusted proxies (eg CloudFront: 1)
	// count. Unset, the TCP peer is the client.
	const xffDepth = Number(process.env.XFF_DEPTH) || 0;

	const rendered = await server.respond(
		new Request(url, {
			method,
			signal,
			headers: requestHeaders,
			// Request throws if a GET/HEAD carries one, however it arrived
			body: method === "GET" || method === "HEAD" ? null : body,
		}),
		{
			platform: { event, context },
			getClientAddress() {
				const forwarded =
					xffDepth &&
					headers["x-forwarded-for"]?.split(",").at(-xffDepth)?.trim();
				return forwarded || sourceIp;
			},
		},
	);

	const response = {
		statusCode: rendered.status,
		headers: {
			"cache-control": "no-cache",
		},
		body: "",
	};

	for (const [key, value] of rendered.headers.entries()) {
		if (key === "set-cookie") {
			response.cookies ??= [];
			response.cookies.push(value);
		} else if (key !== "x-sveltekit-page") {
			// `x-sveltekit-page` excluded, security
			response.headers[key] = value;
		}
	}

	if (rendered.body) {
		response.body = Readable.fromWeb(rendered.body);
	}

	return response;
};
export default lambdaHandler;
