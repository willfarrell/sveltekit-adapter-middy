import { strictEqual } from "node:assert";
import test from "node:test";
import lambdaHandler from "./sveltekitHandler.js";

// Sets env vars for one test, restored even when an assertion fails
const withEnv = (t, vars) => {
	for (const [key, value] of Object.entries(vars)) {
		const saved = process.env[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
		t.after(() => {
			if (saved === undefined) delete process.env[key];
			else process.env[key] = saved;
		});
	}
};

// Runs a Function URL event through the handler against a stub server that
// records what SvelteKit would receive
const handle = async ({
	method = "GET",
	path = "/",
	response = new Response("ok"),
	signal = new AbortController().signal,
	...fields
} = {}) => {
	const event = {
		headers: { host: "mysite.com" },
		rawQueryString: "",
		requestContext: { http: { method, path, sourceIp: "9.9.9.9" } },
		...fields,
	};
	const captured = {};
	const context = {
		server: {
			respond: async (request, options) => {
				Object.assign(captured, { request, options });
				return response;
			},
		},
	};
	const result = await lambdaHandler(event, context, { signal });
	return { ...captured, result, event, context };
};

const readBody = async (body) => {
	let text = "";
	for await (const chunk of body) text += chunk;
	return text;
};

test("sveltekitHandler: returns the rendered status and headers", async () => {
	const { result, request } = await handle({
		path: "/page",
		rawQueryString: "foo=bar",
		response: new Response("Hello", {
			headers: { "content-type": "text/html", "cache-control": "max-age=60" },
		}),
	});
	strictEqual(result.statusCode, 200);
	strictEqual(result.headers["content-type"], "text/html");
	strictEqual(result.headers["cache-control"], "max-age=60");
	strictEqual(request.url, "https://mysite.com/page?foo=bar");
});

test("sveltekitHandler: defaults cache-control to no-cache", async () => {
	const { result } = await handle();
	strictEqual(result.headers["cache-control"], "no-cache");
});

test("sveltekitHandler: defaults origin to https://example.com", async (t) => {
	withEnv(t, { HEADER_ORIGIN: undefined });
	const { request } = await handle({ headers: {}, path: "/page" });
	strictEqual(request.url, "https://example.com/page");
});

test("sveltekitHandler: uses HEADER_ORIGIN when set", async (t) => {
	withEnv(t, { HEADER_ORIGIN: "https://custom-origin.com" });
	const { request } = await handle({
		headers: { host: "ignored.com" },
		path: "/test",
	});
	strictEqual(request.url, "https://custom-origin.com/test");
});

// SvelteKit rejects cross-site form posts by comparing the client's `origin`
// header against `url.origin`. Deriving the url from that same header would
// make them equal by construction and the check could never fail.
test("sveltekitHandler: passes the client origin through untouched", async (t) => {
	withEnv(t, { HEADER_ORIGIN: "https://mysite.com" });
	const { request } = await handle({
		method: "POST",
		path: "/login",
		headers: { origin: "https://evil.com", host: "mysite.com" },
		body: "a=1",
	});
	strictEqual(request.headers.get("origin"), "https://evil.com");
	strictEqual(new URL(request.url).origin, "https://mysite.com");
});

test("sveltekitHandler: returns an empty body when the response has none", async () => {
	const { result } = await handle({
		response: new Response(null, { status: 204 }),
	});
	strictEqual(result.statusCode, 204);
	strictEqual(result.body, "");
});

test("sveltekitHandler: streams the rendered body as UTF-8 text", async () => {
	const { result } = await handle({
		response: new Response("<h1>Héllo</h1>", {
			headers: { "content-type": "text/html" },
		}),
	});
	strictEqual(await readBody(result.body), "<h1>Héllo</h1>");
});

test("sveltekitHandler: returns set-cookie headers as a cookies array", async () => {
	const headers = new Headers();
	headers.append("set-cookie", "session=abc; Path=/");
	headers.append("set-cookie", "theme=dark; Path=/");
	const { result } = await handle({
		response: new Response("ok", { headers }),
	});
	strictEqual(result.cookies.length, 2);
	strictEqual(result.headers["set-cookie"], undefined);
});

test("sveltekitHandler: excludes the x-sveltekit-page header", async () => {
	const { result } = await handle({
		response: new Response("ok", { headers: { "x-sveltekit-page": "true" } }),
	});
	strictEqual(result.headers["x-sveltekit-page"], undefined);
});

// Function URL (payload v2) moves the `cookie` header into `event.cookies`
test("sveltekitHandler: passes event.cookies through as the cookie header", async () => {
	const { request } = await handle({ cookies: ["session=abc", "theme=dark"] });
	strictEqual(request.headers.get("cookie"), "session=abc; theme=dark");
});

test("sveltekitHandler: decodes a base64 encoded body", async () => {
	const { request } = await handle({
		method: "POST",
		body: Buffer.from("hello").toString("base64"),
		isBase64Encoded: true,
	});
	strictEqual(request.method, "POST");
	strictEqual(await request.text(), "hello");
});

// Found by handler.fuzz.js: `Buffer.from(undefined, "base64")` throws
test("sveltekitHandler: base64 flag without a body is not decoded", async () => {
	const { request } = await handle({ method: "POST", isBase64Encoded: true });
	strictEqual(await request.text(), "");
});

// `content-encoding` is a compression scheme (gzip, br), not a Buffer encoding:
// `Buffer.from(body, "gzip")` throws `ERR_UNKNOWN_ENCODING`
test("sveltekitHandler: content-encoding is not treated as a body encoding", async () => {
	const { request } = await handle({
		method: "POST",
		headers: { host: "mysite.com", "content-encoding": "gzip" },
		body: "hello",
	});
	strictEqual(await request.text(), "hello");
});

test("sveltekitHandler: drops a body on GET and HEAD, which Request forbids", async () => {
	for (const method of ["GET", "HEAD"]) {
		const { request, result } = await handle({ method, body: "unexpected" });
		strictEqual(result.statusCode, 200);
		strictEqual(await request.text(), "");
	}
});

// Middy aborts the signal on early timeout; `request.signal` lets SvelteKit
// and fetches in `load` stop work the response will never carry
test("sveltekitHandler: request.signal follows the middy abort signal", async () => {
	const controller = new AbortController();
	const { request } = await handle({ signal: controller.signal });
	strictEqual(request.signal.aborted, false);
	controller.abort();
	strictEqual(request.signal.aborted, true);
});

// Middleware results (eg ssm `setToContext`) reach hooks and `load` as `event.platform`
test("sveltekitHandler: passes the lambda event and context as platform", async () => {
	const { options, event, context } = await handle();
	strictEqual(options.platform.event, event);
	strictEqual(options.platform.context, context);
});

// The Function URL is public: without a trusted proxy count, any caller can
// write `x-forwarded-for`, so only the TCP peer is trustworthy
const clientAddress = async (forwardedFor, depth) => {
	const saved = process.env.XFF_DEPTH;
	if (depth === undefined) delete process.env.XFF_DEPTH;
	else process.env.XFF_DEPTH = depth;
	try {
		const { options } = await handle({
			headers: { host: "mysite.com", "x-forwarded-for": forwardedFor },
		});
		return options.getClientAddress();
	} finally {
		if (saved === undefined) delete process.env.XFF_DEPTH;
		else process.env.XFF_DEPTH = saved;
	}
};

test("sveltekitHandler: getClientAddress ignores x-forwarded-for by default", async () => {
	strictEqual(await clientAddress("6.6.6.6"), "9.9.9.9");
});

test("sveltekitHandler: getClientAddress trusts XFF_DEPTH proxies from the right", async () => {
	strictEqual(await clientAddress("6.6.6.6, 1.2.3.4", "1"), "1.2.3.4");
	strictEqual(await clientAddress("6.6.6.6, 1.2.3.4, 5.5.5.5", "2"), "1.2.3.4");
});

test("sveltekitHandler: getClientAddress falls back to sourceIp when the list is short", async () => {
	strictEqual(await clientAddress("1.2.3.4", "2"), "9.9.9.9");
	strictEqual(await clientAddress(undefined, "1"), "9.9.9.9");
});
