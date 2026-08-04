// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { Readable } from "node:stream";

const lambdaHandler = async (event, context, { signal: _signal }) => {
	const { server, env: _env } = context;
	const { headers, rawQueryString, body: rawBody, isBase64Encoded } = event;
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
		typeof rawBody === "string"
			? Buffer.from(rawBody, isBase64Encoded ? "base64" : "utf8")
			: rawBody;

	const rendered = await server.respond(
		new Request(url, {
			method,
			headers: new Headers(headers),
			// Request throws if a GET/HEAD carries one, however it arrived
			body: method === "GET" || method === "HEAD" ? null : body,
		}),
		{
			getClientAddress() {
				// CloudFront appends the viewer ip to any client-supplied list, so
				// the rightmost entry is the only one a client can't forge.
				const forwarded = headers["x-forwarded-for"]?.split(",").at(-1)?.trim();
				return forwarded || sourceIp;
			},
		},
	);

	if (rendered) {
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
	}

	return {
		statusCode: 404,
	};
};
export default lambdaHandler;
