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
	let capturedRequest;
	const context = {
		server: {
			respond: async (req) => {
				capturedRequest = req;
				return mockResponse;
			},
		},
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.statusCode, 200);
	strictEqual(result.headers["content-type"], "text/html");
	strictEqual(result.headers["cache-control"], "max-age=60");
	strictEqual(capturedRequest.url, "https://mysite.com/page?foo=bar");
});

test("sveltekitHandler: defaults cache-control to no-cache", async () => {
	const mockResponse = new Response("ok", {
		status: 200,
		headers: { "content-type": "text/plain" },
	});
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
	strictEqual(result.headers["cache-control"], "no-cache");
});

test("sveltekitHandler: defaults origin to https://example.com", async () => {
	const originalEnv = process.env.HEADER_ORIGIN;
	delete process.env.HEADER_ORIGIN;
	const mockResponse = new Response("ok", { status: 200 });
	let capturedUrl;
	const event = {
		headers: {},
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method: "GET", path: "/page" } },
	};
	const context = {
		server: {
			respond: async (req) => {
				capturedUrl = req.url;
				return mockResponse;
			},
		},
		env: process.env,
	};
	await lambdaHandler(event, context, { signal: new AbortController().signal });
	strictEqual(capturedUrl, "https://example.com/page");
	if (originalEnv !== undefined) process.env.HEADER_ORIGIN = originalEnv;
});

test("sveltekitHandler: returns empty body when response has no body", async () => {
	const mockResponse = new Response(null, { status: 204 });
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
	strictEqual(result.statusCode, 204);
	strictEqual(result.body, "");
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
	let capturedRequest;
	const context = {
		server: {
			respond: async (req) => {
				capturedRequest = req;
				return mockResponse;
			},
		},
		env: process.env,
	};
	const result = await lambdaHandler(event, context, {
		signal: new AbortController().signal,
	});
	strictEqual(result.statusCode, 200);
	strictEqual(capturedRequest.method, "POST");
	strictEqual(capturedRequest.headers.get("origin"), "https://mysite.com");
	strictEqual(await capturedRequest.text(), "hello");
});

test("sveltekitHandler: decodes body using content-encoding header", async () => {
	const mockResponse = new Response("ok", {
		status: 200,
		headers: { "content-type": "text/plain" },
	});
	const event = {
		headers: {
			origin: "https://mysite.com",
			"content-encoding": "hex",
		},
		rawQueryString: "",
		body: Buffer.from("hello").toString("hex"),
		isBase64Encoded: false,
		requestContext: { http: { method: "POST", path: "/api" } },
	};
	let capturedRequest;
	const context = {
		server: {
			respond: async (req) => {
				capturedRequest = req;
				return mockResponse;
			},
		},
		env: process.env,
	};
	await lambdaHandler(event, context, { signal: new AbortController().signal });
	strictEqual(await capturedRequest.text(), "hello");
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
	strictEqual(capturedUrl, "https://custom-origin.com/test");
	if (originalEnv === undefined) delete process.env.HEADER_ORIGIN;
	else process.env.HEADER_ORIGIN = originalEnv;
});

test("sveltekitHandler: body streams rendered HTML as UTF-8 text", async () => {
	const responseBody = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("<h1>Héllo</h1>"));
			controller.close();
		},
	});
	const mockResponse = new Response(responseBody, {
		status: 200,
		headers: { "content-type": "text/html" },
	});
	const event = {
		headers: { origin: "https://mysite.com" },
		rawQueryString: "",
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
	let text = "";
	for await (const chunk of result.body) {
		text += chunk;
	}
	strictEqual(text, "<h1>Héllo</h1>");
});
