// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { pipeline, Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { server } from "./server.js"; // From build directory

// Started at cold start; a failure is dropped so the next request retries
const start = () =>
	server.init({ env: process.env }).catch((err) => {
		init = undefined;
		throw err;
	});
let init = start();
// Handled here, as no request awaits it yet; the failure is dropped, so the
// first request starts init again
init.catch(() => {});

if (!process.env.HEADER_ORIGIN) {
	console.warn(
		"sveltekit-adapter-middy: HEADER_ORIGIN is not set, the url origin falls back to the `host` header. Behind CloudFront that is the Function URL domain, and form posts will fail the CSRF check.",
	);
}

const formAction = 'action="?/';
const formActionReplacement = 'action="?%2F';

// Length of the suffix of `text` that could be the start of a `formAction`
// completed by the next chunk. `formAction` holds a single `a`, so only the
// suffix from the last `a` can be one.
const partialMatchLength = (text) => {
	const suffix = text.slice(text.lastIndexOf("a"));
	return formAction.startsWith(suffix) ? suffix.length : 0;
};

// Emits each chunk as it arrives, holding back only a possible partial match,
// so streamed pages still flush their shell before awaited data resolves.
// Decoding here rather than with `setEncoding` saves a utf8 round trip per
// chunk, since a Transform turns written strings back into Buffers.
const formActionStream = () => {
	let tail = "";
	const decoder = new StringDecoder(); // utf8
	return new Transform({
		transform(chunk, _encoding, callback) {
			const text = (tail + decoder.write(chunk)).replaceAll(
				formAction,
				formActionReplacement,
			);
			const split = text.length - partialMatchLength(text);
			tail = text.slice(split);
			callback(null, text.slice(0, split));
		},
		flush(callback) {
			callback(null, tail + decoder.end());
		},
	});
};

const sveltekitMiddleware = () => {
	const sveltekitMiddlewareBefore = async (request) => {
		request.context.server = server;
		init ??= start();
		await init;
	};

	const sveltekitMiddlewareAfter = async (request) => {
		// Workaround: AWS Function URLs doesn't support querystring keys that contain `/`
		// A string body is the empty one `sveltekitHandler` sets, nothing to rewrite
		if (
			typeof request.response.body !== "string" &&
			request.response.headers?.["content-type"]?.includes("text/html")
		) {
			// `pipeline` passes a render error on, so the response ends rather than hangs
			request.response.body = pipeline(
				request.response.body,
				formActionStream(),
				() => {},
			);
			// The rewrite lengthens the body; streamed, it needs no length
			delete request.response.headers["content-length"];
		}
	};
	return {
		before: sveltekitMiddlewareBefore,
		after: sveltekitMiddlewareAfter,
	};
};
export default sveltekitMiddleware;
