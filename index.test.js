import { deepStrictEqual, ok, strictEqual } from "node:assert";
import test from "node:test";
import sveltekitAdapterMiddy, { splitRoutes } from "./index.js";

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
