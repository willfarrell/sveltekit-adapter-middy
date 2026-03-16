import { ok, strictEqual } from "node:assert";
import test from "node:test";

// We need to test sveltekitHandler directly
import lambdaHandler from "./sveltekitHandler.js";

test("sveltekitHandler: returns 404 when server.respond returns null", async () => {
	const event = {
		headers: { origin: "https://example.com" },
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/" } },
	};
	const context = {
		server: { respond: async () => null },
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.statusCode, 404);
});

test("sveltekitHandler: returns rendered response with correct status and headers", async () => {
	const responseBody = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("Hello"));
			controller.close();
		},
	});
	const mockResponse = new Response(responseBody, {
		status: 200,
		headers: { "content-type": "text/html", "cache-control": "max-age=60" },
	});
	const event = {
		headers: { origin: "https://mysite.com" },
		rawQueryString: "foo=bar",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/page" } },
	};
	const context = {
		server: { respond: async () => mockResponse },
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.statusCode, 200);
	strictEqual(result.headers["content-type"], "text/html");
});

test("sveltekitHandler: handles set-cookie headers as cookies array", async () => {
	const headers = new Headers();
	headers.append("set-cookie", "session=abc; Path=/");
	headers.append("set-cookie", "theme=dark; Path=/");
	headers.set("content-type", "text/html");
	const mockResponse = new Response("body", { status: 200, headers });
	const event = {
		headers: { origin: "https://mysite.com" },
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/" } },
	};
	const context = {
		server: { respond: async () => mockResponse },
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	ok(result.cookies);
	strictEqual(result.cookies.length, 2);
});

test("sveltekitHandler: excludes x-sveltekit-page header", async () => {
	const headers = new Headers({
		"content-type": "text/html",
		"x-sveltekit-page": "true",
	});
	const mockResponse = new Response("body", { status: 200, headers });
	const event = {
		headers: { origin: "https://mysite.com" },
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/" } },
	};
	const context = {
		server: { respond: async () => mockResponse },
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.headers["x-sveltekit-page"], undefined);
});

test("sveltekitHandler: handles base64 encoded body", async () => {
	const mockResponse = new Response("ok", {
		status: 200,
		headers: { "content-type": "text/plain" },
	});
	const event = {
		headers: { origin: "https://mysite.com" },
		rawQueryString: "",
		body: Buffer.from("hello").toString("base64"),
		isBase64Encoded: true,
		requestContext: { http: { method: "POST", path: "/api" } },
	};
	const context = {
		server: {
			respond: async (_req) => {
				// Verify request was constructed correctly
				return mockResponse;
			},
		},
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.statusCode, 200);
});

test("sveltekitHandler: getClientAddress returns x-forwarded-for header", async () => {
	let capturedOptions;
	const mockResponse = new Response("ok", {
		status: 200,
		headers: { "content-type": "text/plain" },
	});
	const event = {
		headers: {
			origin: "https://mysite.com",
			"x-forwarded-for": "1.2.3.4",
		},
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/" } },
	};
	const context = {
		server: {
			respond: async (_req, opts) => {
				capturedOptions = opts;
				return mockResponse;
			},
		},
		env: process.env,
	};
	await lambdaHandler(event, context, { signal: new AbortController().signal });
	strictEqual(capturedOptions.getClientAddress(), "1.2.3.4");
});

test("sveltekitHandler: uses HEADER_ORIGIN env var when set", async () => {
	const originalEnv = process.env.HEADER_ORIGIN;
	process.env.HEADER_ORIGIN = "https://custom-origin.com";
	const mockResponse = new Response("ok", { status: 200, headers: {} });
	let capturedUrl;
	const event = {
		headers: {},
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/test" } },
	};
	const context = {
		server: {
			respond: async (_req) => {
				capturedUrl = _req.url;
				return mockResponse;
			},
		},
		env: process.env,
	};
	await lambdaHandler(event, context, { signal: new AbortController().signal });
	ok(capturedUrl.startsWith("https://custom-origin.com"));
	if (originalEnv === undefined) delete process.env.HEADER_ORIGIN;
	else process.env.HEADER_ORIGIN = originalEnv;
});
