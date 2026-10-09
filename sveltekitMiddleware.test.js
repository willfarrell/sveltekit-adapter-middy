import { ok, strictEqual } from "node:assert";
import { once } from "node:events";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// sveltekitMiddleware.js is a build-directory template; `./server.js` only
// exists after a SvelteKit build. Stage it in a temp
// build directory with stubs so it can be imported.
const buildDir = mkdtempSync(join(tmpdir(), "adapter-middy-test-"));
cpSync(
	join(import.meta.dirname, "sveltekitMiddleware.js"),
	join(buildDir, "sveltekitMiddleware.js"),
);
writeFileSync(
	join(buildDir, "server.js"),
	"export const server = { init(opts) { globalThis.__serverInitOpts = opts; return Promise.resolve(); } };",
);
const sveltekitMiddleware = (
	await import(pathToFileURL(join(buildDir, "sveltekitMiddleware.js")))
).default;

const htmlBody = (html) => Readable.fromWeb(new Response(html).body);

const readBody = async (body) => {
	let text = "";
	for await (const chunk of body) {
		text += chunk;
	}
	return text;
};

test("sveltekitMiddleware: provides server to context and initializes with env", async () => {
	const request = { context: {} };
	await sveltekitMiddleware().before(request);
	ok(request.context.server);
	strictEqual(globalThis.__serverInitOpts.env, process.env);
});

test("sveltekitMiddleware: ignores responses without headers", async () => {
	const request = { response: {} };
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, undefined);
});

test("sveltekitMiddleware: ignores responses without content-type", async () => {
	const request = { response: { headers: {}, body: null } };
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, null);
});

test("sveltekitMiddleware: encodes form action querystring slashes in html responses", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html" },
			body: htmlBody('<form action="?/login" method="POST"></form>'),
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(
		await readBody(request.response.body),
		'<form action="?%2Flogin" method="POST"></form>',
	);
});

test("sveltekitMiddleware: keeps multi-byte characters split across chunks", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html" },
			// "é" arriving as two buffers, as any re-chunked stream can deliver it
			body: Readable.from([Buffer.from([0xc3]), Buffer.from([0xa9])]),
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(await readBody(request.response.body), "é");
});

test("sveltekitMiddleware: leaves non-html responses untouched", async () => {
	const body = htmlBody('{"action":"?/login"}');
	const request = {
		response: {
			headers: { "content-type": "application/json" },
			body,
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, body);
	strictEqual(await readBody(request.response.body), '{"action":"?/login"}');
});

// HEAD, 204, or an endpoint returning `new Response(null)` with an html type
test("sveltekitMiddleware: leaves an empty html body alone", async () => {
	const request = {
		response: { headers: { "content-type": "text/html" }, body: "" },
	};
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, "");
});

test("sveltekitMiddleware: rewrites a form action split across chunks", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html" },
			body: Readable.from(['<form action="?', '/login"></form>']),
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(
		await readBody(request.response.body),
		'<form action="?%2Flogin"></form>',
	);
});

// Streamed pages flush the shell before awaited data resolves; holding a chunk
// back until the next one arrives would delay the shell until the data is ready
test("sveltekitMiddleware: emits a chunk without waiting for the next", async () => {
	const source = new PassThrough();
	const request = {
		response: { headers: { "content-type": "text/html" }, body: source },
	};
	await sveltekitMiddleware().after(request);
	source.write("<html><body>shell</body>");
	const [chunk] = await Promise.race([
		once(request.response.body, "data"),
		setTimeout(100).then(() => {
			throw new Error("chunk held back");
		}),
	]);
	ok(String(chunk).startsWith("<html><body>shell"));
	source.end();
});

// Behind CloudFront the url origin would be the Function URL domain, so every
// form post fails SvelteKit's CSRF check with nothing in the logs to say why
const coldStartWarnings = async (headerOrigin) => {
	const saved = process.env.HEADER_ORIGIN;
	if (headerOrigin === undefined) delete process.env.HEADER_ORIGIN;
	else process.env.HEADER_ORIGIN = headerOrigin;
	const warn = console.warn;
	const warnings = [];
	console.warn = (message) => warnings.push(message);
	try {
		const url = pathToFileURL(join(buildDir, "sveltekitMiddleware.js"));
		url.search = `?origin=${headerOrigin}`; // a fresh module instance per case
		await import(url);
	} finally {
		console.warn = warn;
		if (saved === undefined) delete process.env.HEADER_ORIGIN;
		else process.env.HEADER_ORIGIN = saved;
	}
	return warnings;
};

test("sveltekitMiddleware: warns once at cold start when HEADER_ORIGIN is unset", async () => {
	const [warning, ...rest] = await coldStartWarnings(undefined);
	ok(warning.includes("HEADER_ORIGIN is not set"));
	strictEqual(rest.length, 0);
	strictEqual((await coldStartWarnings("https://mysite.com")).length, 0);
});
