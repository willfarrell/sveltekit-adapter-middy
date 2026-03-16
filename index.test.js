import { ok, strictEqual } from "node:assert";
import test from "node:test";
import sveltekitAdapterMiddy from "./index.js";

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
