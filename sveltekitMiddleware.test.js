import { ok, strictEqual } from "node:assert";
import { cpSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";

// sveltekitMiddleware.js is a build-directory template; `./index.js` and
// `./manifest.js` only exist after a SvelteKit build. Stage it in a temp
// build directory with stubs so it can be imported.
const buildDir = mkdtempSync(join(tmpdir(), "adapter-middy-test-"));
cpSync(
	join(import.meta.dirname, "sveltekitMiddleware.js"),
	join(buildDir, "sveltekitMiddleware.js"),
);
writeFileSync(
	join(buildDir, "index.js"),
	"export class Server { init(opts) { globalThis.__serverInitOpts = opts; return Promise.resolve(); } }",
);
writeFileSync(join(buildDir, "manifest.js"), "export const manifest = {};");
symlinkSync(
	join(import.meta.dirname, "node_modules"),
	join(buildDir, "node_modules"),
	"dir",
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
