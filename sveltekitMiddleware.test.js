import { ok, rejects, strictEqual } from "node:assert";
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
	"export const server = { init(opts) { globalThis.__serverInitOpts = opts; return globalThis.__serverInit?.() ?? Promise.resolve(); } };",
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

// The rewrite adds 2 bytes per form action, so the length SvelteKit set from the
// original body would make clients truncate the page
test("sveltekitMiddleware: drops content-length from a rewritten html response", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html", "content-length": "23" },
			body: htmlBody('<form action="?/login">'),
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.headers["content-length"], undefined);
	strictEqual(
		await readBody(request.response.body),
		'<form action="?%2Flogin">',
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

test("sveltekitMiddleware: ends a cut-off multi-byte character with U+FFFD", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html" },
			body: Readable.from([Buffer.from("<p>"), Buffer.from([0xc3])]),
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(await readBody(request.response.body), "<p>�");
});

test("sveltekitMiddleware: leaves non-html responses untouched", async () => {
	const body = htmlBody('{"action":"?/login"}');
	const request = {
		response: {
			headers: { "content-type": "application/json", "content-length": "20" },
			body,
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, body);
	strictEqual(request.response.headers["content-length"], "20");
	strictEqual(await readBody(request.response.body), '{"action":"?/login"}');
});

// HEAD, 204, or an endpoint returning `new Response(null)` with an html type
test("sveltekitMiddleware: leaves an empty html body alone", async () => {
	const request = {
		response: {
			headers: { "content-type": "text/html", "content-length": "0" },
			body: "",
		},
	};
	await sveltekitMiddleware().after(request);
	strictEqual(request.response.body, "");
	strictEqual(request.response.headers["content-length"], "0");
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

// Pins the chunk-boundary holdback, which relies on `formAction` holding one `a`
test("sveltekitMiddleware: rewrites a form action at every chunk split", async () => {
	const cases = [
		['<form action="?/login">', '<form action="?%2Flogin">'],
		// a near miss must pass through unchanged wherever it is cut
		['<a href="x">action="?x</a>', '<a href="x">action="?x</a>'],
	];
	for (const [html, expected] of cases) {
		for (let i = 1; i < html.length; i++) {
			const request = {
				response: {
					headers: { "content-type": "text/html" },
					body: Readable.from([html.slice(0, i), html.slice(i)]),
				},
			};
			await sveltekitMiddleware().after(request);
			strictEqual(
				await readBody(request.response.body),
				expected,
				`split ${i}`,
			);
		}
	}
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
	strictEqual(String(chunk), "<html><body>shell</body>");
	source.end();
});

// A rejected init would otherwise be awaited by every request the warm container serves
test("sveltekitMiddleware: a failed init is retried on the next request", async () => {
	let calls = 0;
	// Rejects after a tick, once `before` is awaiting it, as a failing `init` hook would
	globalThis.__serverInit = () =>
		setTimeout(10).then(() => {
			calls++;
			if (calls === 1) throw new Error("init failed");
		});
	try {
		const url = pathToFileURL(join(buildDir, "sveltekitMiddleware.js"));
		url.search = "?init-retry"; // a fresh module instance, so a fresh init
		const { default: middleware } = await import(url);
		await rejects(middleware().before({ context: {} }), /init failed/);
		await middleware().before({ context: {} });
		strictEqual(calls, 2);
	} finally {
		delete globalThis.__serverInit;
	}
});

// On Lambda init fails at cold start, before any event arrives; unhandled
// until then, the rejection would take the process down instead
test("sveltekitMiddleware: an init failing at cold start is retried by the first request", async () => {
	let calls = 0;
	globalThis.__serverInit = async () => {
		calls++;
		if (calls === 1) throw new Error("cold start failed");
	};
	const unhandled = [];
	const onUnhandled = (reason) => unhandled.push(reason);
	process.on("unhandledRejection", onUnhandled);
	try {
		const url = pathToFileURL(join(buildDir, "sveltekitMiddleware.js"));
		url.search = "?cold-start-failure";
		const { default: middleware } = await import(url);
		await setTimeout(10); // the first event arrives later
		await middleware().before({ context: {} });
		strictEqual(calls, 2);
		strictEqual(unhandled.length, 0);
	} finally {
		process.off("unhandledRejection", onUnhandled);
		delete globalThis.__serverInit;
	}
});

// Without it the rewritten body never ends and the lambda runs to its timeout
test("sveltekitMiddleware: a render error ends the rewritten body", async () => {
	const source = new PassThrough();
	const request = {
		response: { headers: { "content-type": "text/html" }, body: source },
	};
	await sveltekitMiddleware().after(request);
	source.destroy(new Error("render failed"));
	await rejects(readBody(request.response.body), /render failed/);
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
