import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import lambdaHandler from "./sveltekitHandler.js";

// sveltekitMiddleware.js imports `./server.js` from the build directory, so
// stage it next to a stub, as sveltekitMiddleware.test.js does
const buildDir = mkdtempSync(join(tmpdir(), "adapter-middy-bench-"));
cpSync(
	join(import.meta.dirname, "sveltekitMiddleware.js"),
	join(buildDir, "sveltekitMiddleware.js"),
);
writeFileSync(
	join(buildDir, "server.js"),
	"export const server = { init: async () => {} };",
);
process.env.HEADER_ORIGIN ??= "https://example.com";
const sveltekitMiddleware = (
	await import(pathToFileURL(join(buildDir, "sveltekitMiddleware.js")))
).default;

const makeEvent = (rawQueryString = "", headers = { host: "example.com" }) => ({
	headers,
	rawQueryString,
	isBase64Encoded: false,
	requestContext: { http: { method: "GET", path: "/", sourceIp: "9.9.9.9" } },
});

// What a browser sends through CloudFront to a Function URL
const browserHeaders = {
	host: "example.com",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"accept-encoding": "gzip, deflate, br, zstd",
	"accept-language": "en-CA,en;q=0.9",
	"cache-control": "no-cache",
	"sec-fetch-dest": "document",
	"sec-fetch-mode": "navigate",
	"sec-fetch-site": "none",
	"sec-fetch-user": "?1",
	"upgrade-insecure-requests": "1",
	"user-agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
	"x-amzn-trace-id": "Root=1-67891233-abcdef012345678912345678",
	"x-forwarded-for": "1.2.3.4, 9.9.9.9",
	"x-forwarded-port": "443",
	"x-forwarded-proto": "https",
};

const notFound = {
	server: { respond: async () => new Response(null, { status: 404 }) },
};

// A rendered page as SvelteKit returns it
const page = {
	server: {
		respond: async () => {
			const headers = new Headers({
				"content-type": "text/html",
				etag: '"abc123"',
				"x-sveltekit-page": "true",
				"content-security-policy": "default-src 'self'",
			});
			headers.append("set-cookie", "session=abc; Path=/; HttpOnly");
			headers.append("set-cookie", "theme=dark; Path=/");
			return new Response("<html></html>", { headers });
		},
	},
};

// ~64KB of html in 4KB chunks, with form actions, one split across chunks
const html = Buffer.from(
	Array.from(
		{ length: 400 },
		(_, i) =>
			`<div class="row-${i}"><p>Lorem ipsum dolor sit amet, consectetur.</p>${i % 80 ? "" : '<form action="?/save" method="POST"></form>'}</div>`,
	).join(""),
);
const split = html.indexOf('action="?/') + 9;
const chunks = [html.subarray(0, split)];
for (let i = split; i < html.length; i += 4096) {
	chunks.push(html.subarray(i, i + 4096));
}

const samples = 30;
const warmup = 10;

// Median ops/sec over `samples` runs of `ops` calls, after `warmup` runs
const bench = async (name, ops, fn) => {
	const rates = [];
	for (let run = 0; run < warmup + samples; run++) {
		const start = performance.now();
		for (let i = 0; i < ops; i++) await fn();
		if (run >= warmup) rates.push((ops * 1000) / (performance.now() - start));
	}
	rates.sort((a, b) => a - b);
	console.log(`${name}: ${Math.round(rates[samples >> 1])} ops/sec`);
};

const handle = (event, context) =>
	lambdaHandler(event, context, { signal: new AbortController().signal });

await bench("GET request - 404", 1_000, () => handle(makeEvent(), notFound));
await bench("GET with query string - 404", 1_000, () =>
	handle(makeEvent("foo=bar&baz=qux"), notFound),
);
await bench("GET browser page - 200", 1_000, () =>
	handle(makeEvent("", browserHeaders), page),
);

const { after } = sveltekitMiddleware();
await bench("html form action rewrite - 64KB", 100, async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html" },
			body: Readable.fromWeb(ReadableStream.from(chunks)),
		},
	};
	await after(request);
	for await (const _ of request.response.body);
});
