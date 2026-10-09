import { ok, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";

// Builds a real SvelteKit 3 app with this adapter and invokes the bundled
// lambdas with Function URL events. Only the `awslambda` runtime global is stubbed.
const fixture = join(import.meta.dirname, "fixture");
const build = join(fixture, "build");
execFileSync(
	process.execPath,
	[join(import.meta.dirname, "../node_modules/vite/bin/vite.js"), "build"],
	{ cwd: fixture, stdio: "pipe" },
);

globalThis.awslambda = {
	streamifyResponse: (handler) => handler,
	HttpResponseStream: {
		from: (stream, prelude) => Object.assign(stream, { prelude }),
	},
};
process.env.HEADER_ORIGIN = "https://mysite.com";

const loadLambda = async (name) =>
	(await import(pathToFileURL(join(build, `${name}.mjs`)))).handler;

const invoke = async (handler, { method = "GET", path = "/", ...fields }) => {
	const chunks = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	await handler(
		{
			headers: { host: "abc.lambda-url.us-east-1.on.aws" },
			rawQueryString: "",
			isBase64Encoded: false,
			requestContext: { http: { method, path, sourceIp: "9.9.9.9" } },
			...fields,
		},
		stream,
		{ functionName: "e2e", getRemainingTimeInMillis: () => 30_000 },
	);
	return { ...stream.prelude, body: Buffer.concat(chunks).toString() };
};

test("e2e: split builds one lambda per entry plus index", () => {
	ok(existsSync(join(build, "index.mjs")));
	ok(existsSync(join(build, "admin.mjs")));
});

test("e2e: renders with request cookies and the lambda context as platform", async () => {
	const response = await invoke(await loadLambda("index"), {
		cookies: ["session=abc"],
	});
	strictEqual(response.statusCode, 200);
	ok(response.body.includes("session:abc"), response.body);
	ok(response.body.includes("function:e2e"), response.body);
});

test("e2e: form actions are rewritten for Function URL query strings", async () => {
	const { body } = await invoke(await loadLambda("index"), {});
	ok(body.includes('action="?%2Flogin"'), body);
});

test("e2e: a same-origin form post runs the action and sets its cookie", async () => {
	const response = await invoke(await loadLambda("index"), {
		method: "POST",
		rawQueryString: "%2Flogin",
		headers: {
			host: "abc.lambda-url.us-east-1.on.aws",
			origin: "https://mysite.com",
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "",
	});
	strictEqual(response.statusCode, 200);
	ok(response.cookies?.some((cookie) => cookie.startsWith("session=new")));
});

test("e2e: a cross-site form post fails the CSRF check", async () => {
	const response = await invoke(await loadLambda("index"), {
		method: "POST",
		rawQueryString: "%2Flogin",
		headers: {
			host: "abc.lambda-url.us-east-1.on.aws",
			origin: "https://evil.com",
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "",
	});
	strictEqual(response.statusCode, 403);
});

test("e2e: each split lambda only serves its own routes", async () => {
	const admin = await invoke(await loadLambda("admin"), { path: "/admin" });
	strictEqual(admin.statusCode, 200);
	ok(admin.body.includes("<p>admin</p>"), admin.body);
	const index = await invoke(await loadLambda("index"), { path: "/admin" });
	strictEqual(index.statusCode, 404);
});
