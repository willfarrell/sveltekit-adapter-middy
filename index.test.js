import { deepStrictEqual, ok, rejects, strictEqual, throws } from "node:assert";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import sveltekitAdapterMiddy, { resolveHandler, splitRoutes } from "./index.js";

// `<tmp>/routes/admin/handler.js` and `<tmp>/routes/(app)/reports/handler.js`
const routesFixture = () => {
	const src = mkdtempSync(join(tmpdir(), "adapter-middy-routes-"));
	const routes = join(src, "routes");
	for (const dir of [join(routes, "admin"), join(routes, "(app)", "reports")]) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "handler.js"), "");
	}
	return { src, routes };
};

test("adapter: returns object with name property", () => {
	const adapter = sveltekitAdapterMiddy();
	strictEqual(adapter.name, "sveltekit-adapter-middy");
});

// Assets live in S3/CloudFront and `server.init` gets no `read`, so claiming
// support would only move the failure from build time to runtime
// A CommonJS vite config loads the adapter with require(esm)
test("adapter: resolves for require() as well as import", () => {
	const require = createRequire(import.meta.url);
	strictEqual(
		require("sveltekit-adapter-middy").default,
		sveltekitAdapterMiddy,
	);
});

test("adapter: supports.read returns false", () => {
	const adapter = sveltekitAdapterMiddy();
	strictEqual(adapter.supports.read(), false);
});

test("splitRoutes: splits by prefix, remainder to index", () => {
	const ids = (routes) => routes.map(({ id }) => id);
	const routes = [
		{ id: "/" },
		{ id: "/admin" },
		{ id: "/admin/users/[id]" },
		{ id: "/administration" },
		{ id: "/api/health" },
	].map((route) => ({ ...route }));

	const split = splitRoutes(routes, [{ name: "admin", prefix: "/admin" }]);

	deepStrictEqual(ids(split.admin), ["/admin", "/admin/users/[id]"]);
	deepStrictEqual(ids(split.index), ["/", "/administration", "/api/health"]);
});

test("resolveHandler: entry handlerPath beats a route-local handler.js", () => {
	const { src, routes } = routesFixture();
	const explicit = join(src, "explicit.js");
	writeFileSync(explicit, "");
	strictEqual(
		resolveHandler(
			{ prefix: "/admin", handlerPath: explicit },
			{ routesDir: routes, builtin: "builtin.js" },
		),
		explicit,
	);
});

test("resolveHandler: route-local handler.js beats the top-level handlerPath", () => {
	const { src, routes } = routesFixture();
	const top = join(src, "top.js");
	writeFileSync(top, "");
	strictEqual(
		resolveHandler(
			{ prefix: "/admin" },
			{ routesDir: routes, handlerPath: top, builtin: "builtin.js" },
		),
		join(routes, "admin", "handler.js"),
	);
});

test("resolveHandler: layout groups are stripped when matching route ids", () => {
	const { routes } = routesFixture();
	strictEqual(
		resolveHandler(
			{ prefix: "/reports" },
			{ routesDir: routes, builtin: "builtin.js" },
		),
		join(routes, "(app)", "reports", "handler.js"),
	);
});

test("resolveHandler: falls back to src/handler.js, then the built-in", () => {
	const { src, routes } = routesFixture();
	const options = { routesDir: routes, builtin: "builtin.js" };
	strictEqual(resolveHandler({}, options), "builtin.js");
	writeFileSync(join(src, "handler.js"), "");
	strictEqual(resolveHandler({}, options), join(src, "handler.js"));
});

test("resolveHandler: a configured handlerPath that is missing throws", () => {
	const { routes } = routesFixture();
	const options = { routesDir: routes, builtin: "builtin.js" };
	throws(
		() => resolveHandler({ handlerPath: "./missing.js" }, options),
		/handlerPath not found/,
	);
	throws(
		() => resolveHandler({}, { ...options, handlerPath: "./missing.js" }),
		/handlerPath not found/,
	);
});

test("splitRoutes: no entries puts everything in index", () => {
	const routes = [{ id: "/" }, { id: "/admin" }];
	deepStrictEqual(splitRoutes(routes, []), { index: routes });
});

test("splitRoutes: param segments are matched literally", () => {
	const ids = (routes) => routes.map(({ id }) => id);
	const routes = [
		{ id: "/[[lang]]" },
		{ id: "/[[lang]]/admin" },
		{ id: "/[[lang]]/admin/users" },
	];

	const split = splitRoutes(routes, [
		{ name: "admin", prefix: "/[[lang]]/admin" },
	]);

	deepStrictEqual(ids(split.admin), [
		"/[[lang]]/admin",
		"/[[lang]]/admin/users",
	]);
	deepStrictEqual(ids(split.index), ["/[[lang]]"]);
});

test("splitRoutes: function prefix", () => {
	const ids = (routes) => routes.map(({ id }) => id);
	const routes = [
		{ id: "/admin" },
		{ id: "/[lang]/admin/users" },
		{ id: "/[lang=locale]/admin" },
		{ id: "/[lang]/about" },
	];

	const split = splitRoutes(routes, [
		{ name: "admin", prefix: (route) => /(^|\/)admin(\/|$)/.test(route.id) },
	]);

	deepStrictEqual(ids(split.admin), [
		"/admin",
		"/[lang]/admin/users",
		"/[lang=locale]/admin",
	]);
	deepStrictEqual(ids(split.index), ["/[lang]/about"]);
});

// Shaped like the Kit 3 builder: `generateManifest` and `config.kit` are gone
const kit3Builder = (overrides = {}) => {
	const dir = mkdtempSync(join(tmpdir(), "adapter-middy-adapt-"));
	const { routes } = routesFixture();
	const calls = { generateServerInstance: [] };
	const builder = {
		log: { minor: () => {}, warn: () => {}, error: () => {} },
		rimraf: () => {},
		config: {
			paths: { base: "" },
			files: { routes },
			get kit() {
				throw new Error("config.kit is deprecated");
			},
		},
		prerendered: { paths: [] },
		routes: [{ id: "/" }, { id: "/admin" }],
		getBuildDirectory: (name) => join(dir, name),
		writeClient: () => [],
		writePrerendered: () => [],
		writeServer: (dest) => {
			mkdirSync(dest, { recursive: true });
			writeFileSync(
				join(dest, "index.js"),
				"export const create_server = () => ({ init: async () => {} });",
			);
		},
		copy: (from, to) => writeFileSync(to, readFileSync(from)),
		hasServerInstrumentationFile: () => false,
		generateManifest: () => {
			throw new Error("generateManifest has been removed");
		},
		generateServerInstance: (dest, opts) => {
			calls.generateServerInstance.push({ dest, opts });
			writeFileSync(
				dest,
				"import { create_server } from './index.js'; export const server = create_server({});",
			);
		},
		...overrides,
	};
	return { builder, calls, out: join(dir, "build") };
};

// The build dir sits in the os tmpdir, so bare imports resolve from this repo
const esbuildOptions = {
	nodePaths: [fileURLToPath(new URL("./node_modules", import.meta.url))],
};

test("adapt: builds one server instance per split entry with its routes", async () => {
	const { builder, calls, out } = kit3Builder();
	const adapter = sveltekitAdapterMiddy({
		out,
		esbuildOptions,
		split: { admin: "/admin" },
	});
	await adapter.adapt(builder);

	deepStrictEqual(
		calls.generateServerInstance.map(({ opts }) => opts.routes),
		[[{ id: "/admin" }], [{ id: "/" }]],
	);
	ok(existsSync(join(out, "admin.mjs")));
	ok(existsSync(join(out, "index.mjs")));
});

test("adapt: non-esbuild errors are rethrown intact", async () => {
	const boom = new Error("boom");
	const { builder, out } = kit3Builder({
		generateServerInstance: () => {
			throw boom;
		},
	});
	await rejects(sveltekitAdapterMiddy({ out }).adapt(builder), (err) => {
		strictEqual(err, boom);
		return true;
	});
});

test("adapt: esbuild errors are counted", async () => {
	const { builder, out } = kit3Builder({
		generateServerInstance: (dest) => writeFileSync(dest, "export const ="),
	});
	await rejects(
		sveltekitAdapterMiddy({ out, esbuildOptions }).adapt(builder),
		/Bundling with esbuild failed with 1 error$/,
	);
});

test("splitRoutes: the most specific prefix wins, whatever the key order", () => {
	const ids = (routes) => routes.map(({ id }) => id);
	const routes = [{ id: "/admin" }, { id: "/admin/reports/[id]" }];

	const split = splitRoutes(routes, [
		{ name: "admin", prefix: "/admin" },
		{ name: "reports", prefix: "/admin/reports" },
	]);

	deepStrictEqual(ids(split.admin), ["/admin"]);
	deepStrictEqual(ids(split.reports), ["/admin/reports/[id]"]);
});

test("adapt: warns when a split entry matches no routes", async () => {
	const warnings = [];
	const { builder, out } = kit3Builder({
		log: { minor: () => {}, warn: (message) => warnings.push(message) },
	});
	await sveltekitAdapterMiddy({
		out,
		esbuildOptions,
		split: { admin: "/admin/" },
	}).adapt(builder);
	deepStrictEqual(warnings, [
		"sveltekit-adapter-middy: split entry admin matches no routes",
	]);
});

// Kit leaves fully prerendered routes out of the server; `"auto"` ones stay
test("adapt: prerendered routes are left out of every lambda", async () => {
	const warnings = [];
	const { builder, calls, out } = kit3Builder({
		log: { minor: () => {}, warn: (message) => warnings.push(message) },
		routes: [
			{ id: "/", prerender: "auto" },
			{ id: "/blog", prerender: true },
		],
	});
	await sveltekitAdapterMiddy({
		out,
		esbuildOptions,
		split: { blog: "/blog" },
	}).adapt(builder);
	deepStrictEqual(
		calls.generateServerInstance.map(({ opts }) => opts.routes),
		[[], [{ id: "/", prerender: "auto" }]],
	);
	deepStrictEqual(warnings, [
		"sveltekit-adapter-middy: split entry blog matches no routes",
	]);
});

// `index` is the remainder lambda, a split entry by that name would build it twice
test("adapter: a split entry named index throws", () => {
	throws(
		() => sveltekitAdapterMiddy({ split: { index: "/home" } }),
		/split entry name "index" is reserved/,
	);
});

test("resolveHandler: a handler.js at the routes root serves prefix /", () => {
	for (const dir of [[], ["(app)"]]) {
		const { routes } = routesFixture();
		mkdirSync(join(routes, ...dir), { recursive: true });
		writeFileSync(join(routes, ...dir, "handler.js"), "");
		strictEqual(
			resolveHandler(
				{ prefix: "/" },
				{ routesDir: routes, builtin: "builtin.js" },
			),
			join(routes, ...dir, "handler.js"),
		);
	}
});

test("resolveHandler: other files beside a route are not handlers", () => {
	const { routes } = routesFixture();
	mkdirSync(join(routes, "blog"));
	writeFileSync(join(routes, "blog", "+page.svelte"), "");
	strictEqual(
		resolveHandler(
			{ prefix: "/blog" },
			{ routesDir: routes, builtin: "builtin.js" },
		),
		"builtin.js",
	);
});

test("splitRoutes: a string prefix beats a function prefix declared first", () => {
	const split = splitRoutes(
		[{ id: "/" }],
		[
			{ name: "all", prefix: (_route) => true },
			{ name: "root", prefix: "/" },
		],
	);
	deepStrictEqual(split.root, [{ id: "/" }]);
});

test("resolveHandler: a nested route-local handler.js serves its full route id", () => {
	const { routes } = routesFixture();
	mkdirSync(join(routes, "admin", "users"));
	writeFileSync(join(routes, "admin", "users", "handler.js"), "");
	strictEqual(
		resolveHandler(
			{ prefix: "/admin/users" },
			{ routesDir: routes, builtin: "builtin.js" },
		),
		join(routes, "admin", "users", "handler.js"),
	);
});

test("adapt: esbuild warnings go to the builder log", async () => {
	const warnings = [];
	const { builder, out } = kit3Builder({
		log: { minor: () => {}, warn: (message) => warnings.push(message) },
		generateServerInstance: (dest) =>
			writeFileSync(
				dest,
				"export const dup = { a: 1, a: 2 }; export const server = { init: async () => {} };",
			),
	});
	await sveltekitAdapterMiddy({ out, esbuildOptions }).adapt(builder);
	strictEqual(warnings.length, 1);
	ok(warnings[0].includes('Duplicate key "a"'));
});

test("adapt: esbuild errors go to the builder log", async () => {
	const errors = [];
	const { builder, out } = kit3Builder({
		log: { minor: () => {}, warn: () => {}, error: (m) => errors.push(m) },
		generateServerInstance: (dest) => writeFileSync(dest, "export const ="),
	});
	await rejects(sveltekitAdapterMiddy({ out, esbuildOptions }).adapt(builder));
	strictEqual(errors.length, 1);
	ok(errors[0].includes('Expected identifier but found "="'));
});

// The handler is bundled from where it lives, so its own relative imports
// resolve, while `./sveltekitHandler.js` and `./sveltekitMiddleware.js` still
// mean the adapter's copies
test("adapt: a custom handler can import project code by relative path", async () => {
	const { builder, out } = kit3Builder();
	const src = mkdtempSync(join(tmpdir(), "adapter-middy-handler-"));
	writeFileSync(join(src, "config.js"), 'export const name = "from-config";');
	writeFileSync(
		join(src, "handler.js"),
		[
			'import { name } from "./config.js";',
			'import sveltekitHandler from "./sveltekitHandler.js";',
			'import sveltekitMiddleware from "./sveltekitMiddleware.js";',
			"export const handler = { name, sveltekitHandler, sveltekitMiddleware };",
		].join("\n"),
	);
	await sveltekitAdapterMiddy({
		out,
		esbuildOptions,
		handlerPath: join(src, "handler.js"),
	}).adapt(builder);

	const { handler } = await import(pathToFileURL(join(out, "index.mjs")));
	strictEqual(handler.name, "from-config");
	strictEqual(typeof handler.sveltekitHandler, "function");
	strictEqual(typeof handler.sveltekitMiddleware, "function");
});

// Instrumentation (eg OpenTelemetry) must load before any app code, after the
// private env is set, and in the same bundle so the app shares that env module
test("adapt: server instrumentation loads after the env and before the app", async () => {
	const { builder, out } = kit3Builder({
		hasServerInstrumentationFile: () => true,
		createInstrumentationInitializer: ({ outputDirectory }) => {
			const initializer = join(outputDirectory, "env-init.js");
			writeFileSync(initializer, 'globalThis.loadOrder = ["env"];');
			return initializer;
		},
		writeServer: (dest) => {
			mkdirSync(dest, { recursive: true });
			writeFileSync(
				join(dest, "instrumentation.server.js"),
				'globalThis.loadOrder.push("instrumentation");',
			);
			writeFileSync(
				join(dest, "index.js"),
				'globalThis.loadOrder.push("app"); export const create_server = () => ({ init: async () => {} });',
			);
		},
	});
	// Only the app, not the built-in handler, which needs the `awslambda` global
	const handlerPath = join(
		mkdtempSync(join(tmpdir(), "adapter-middy-")),
		"h.js",
	);
	writeFileSync(
		handlerPath,
		'export { default as handler } from "./sveltekitMiddleware.js";',
	);
	await sveltekitAdapterMiddy({ out, esbuildOptions, handlerPath }).adapt(
		builder,
	);

	const { handler } = await import(pathToFileURL(join(out, "index.mjs")));
	strictEqual(typeof handler, "function");
	deepStrictEqual(globalThis.loadOrder, ["env", "instrumentation", "app"]);
});

test("adapter: supports server instrumentation", () => {
	strictEqual(sveltekitAdapterMiddy().supports.instrumentation(), true);
});

// `vite dev` and prerendering run outside Lambda: without a stand-in,
// `event.platform.context.x` throws there
test("adapter: emulates an empty platform outside Lambda", async () => {
	const platform = await sveltekitAdapterMiddy()
		.emulate()
		.platform({ config: {}, prerender: false });
	deepStrictEqual(platform, { event: {}, context: {} });
});

test("adapt: esbuild errors are counted in the plural", async () => {
	const { builder, out } = kit3Builder({
		generateServerInstance: (dest) =>
			writeFileSync(dest, 'import "./missing-a.js"; import "./missing-b.js";'),
	});
	await rejects(
		sveltekitAdapterMiddy({ out, esbuildOptions }).adapt(builder),
		/Bundling with esbuild failed with 2 errors$/,
	);
});

// `{ prefix, handlerPath }` gives one lambda its own middleware stack
test("adapt: a split entry given as an object uses its prefix and handlerPath", async () => {
	const { builder, calls, out } = kit3Builder();
	const handlerPath = join(
		mkdtempSync(join(tmpdir(), "adapter-middy-")),
		"admin.js",
	);
	writeFileSync(handlerPath, 'export const handler = "admin-handler";');
	await sveltekitAdapterMiddy({
		out,
		esbuildOptions,
		split: { admin: { prefix: "/admin", handlerPath } },
	}).adapt(builder);

	deepStrictEqual(calls.generateServerInstance[0].opts.routes, [
		{ id: "/admin" },
	]);
	const { handler } = await import(pathToFileURL(join(out, "admin.mjs")));
	strictEqual(handler, "admin-handler");
});
