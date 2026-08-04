import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
	strictEqual(adapter.name, "@middy/sveltekit");
});

test("adapter: supports.read returns true", () => {
	const adapter = sveltekitAdapterMiddy();
	strictEqual(adapter.supports.read(), true);
});

test("adapter: has adapt method", () => {
	const adapter = sveltekitAdapterMiddy();
	ok(typeof adapter.adapt === "function");
});

test("adapter: accepts custom options", () => {
	const adapter = sveltekitAdapterMiddy({ out: "custom-build" });
	ok(adapter);
	strictEqual(adapter.name, "@middy/sveltekit");
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
