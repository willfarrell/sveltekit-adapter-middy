// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { Transform } from "node:stream";
import { server } from "./server.js"; // From build directory

const init = server.init({ env: process.env });

if (!process.env.HEADER_ORIGIN) {
	console.warn(
		"sveltekit-adapter-middy: HEADER_ORIGIN is not set, the url origin falls back to the `host` header. Behind CloudFront that is the Function URL domain, and form posts will fail the CSRF check.",
	);
}

const formAction = 'action="?/';
const formActionReplacement = 'action="?%2F';

// Length of the longest suffix of `text` that could be the start of a
// `formAction` completed by the next chunk. `text` has been through
// `replaceAll`, so the whole `formAction` never matches, and every string ends
// with the empty prefix, so the loop always returns.
const partialMatchLength = (text) => {
	for (let length = formAction.length; ; length--) {
		if (text.endsWith(formAction.slice(0, length))) return length;
	}
};

// Emits each chunk as it arrives, holding back only a possible partial match,
// so streamed pages still flush their shell before awaited data resolves
const formActionStream = () => {
	let tail = "";
	return new Transform({
		transform(chunk, _encoding, callback) {
			const text = (tail + chunk).replaceAll(formAction, formActionReplacement);
			const split = text.length - partialMatchLength(text);
			tail = text.slice(split);
			callback(null, text.slice(0, split));
		},
		flush(callback) {
			callback(null, tail);
		},
	});
};

const sveltekitMiddleware = () => {
	const sveltekitMiddlewareBefore = async (request) => {
		request.context.server = server;
		await init;
	};

	const sveltekitMiddlewareAfter = async (request) => {
		// Workaround: AWS Function URLs doesn't support querystring keys that contain `/`
		// A string body is the empty one `sveltekitHandler` sets, nothing to rewrite
		if (
			typeof request.response.body !== "string" &&
			request.response.headers?.["content-type"]?.includes("text/html")
		) {
			request.response.body = request.response.body
				.setEncoding() // utf8
				.pipe(formActionStream());
		}
	};
	return {
		before: sveltekitMiddlewareBefore,
		after: sveltekitMiddlewareAfter,
	};
};
export default sveltekitMiddleware;
