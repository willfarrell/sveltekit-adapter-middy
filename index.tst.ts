// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { describe, expect, test } from "tstyche";
import sveltekitAdapterMiddy from "./index.js";

describe("index", () => {
	test("default export is callable and returns adapter object", () => {
		const adapter = sveltekitAdapterMiddy();
		expect(adapter).type.toHaveProperty("name");
		expect(adapter).type.toHaveProperty("adapt");
		expect(adapter).type.toHaveProperty("supports");
	});

	test("accepts options object", () => {
		const adapter = sveltekitAdapterMiddy({
			out: "build",
			handlerPath: "./handler.js",
			esbuildOptions: {},
		});
		expect(adapter).type.toHaveProperty("name");
		expect(adapter).type.toHaveProperty("adapt");
	});
});
