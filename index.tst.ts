// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import type { Adapter } from "@sveltejs/kit";
import { describe, expect, test } from "tstyche";
import sveltekitAdapterMiddy from "./index.js";

describe("index", () => {
	test("default export returns a SvelteKit Adapter", () => {
		expect(sveltekitAdapterMiddy()).type.toBe<Adapter>();
	});

	test("accepts options object", () => {
		expect(sveltekitAdapterMiddy).type.toBeCallableWith({
			out: "build",
			handlerPath: "./handler.js",
			esbuildOptions: { minify: true },
			split: {
				admin: "/[[lang]]/admin",
				api: { prefix: "/api", handlerPath: "./api.js" },
				docs: (route: { id: string }) => route.id.startsWith("/docs"),
			},
		});
	});

	test("rejects mistyped options", () => {
		expect(sveltekitAdapterMiddy).type.not.toBeCallableWith({ out: 1 });
		expect(sveltekitAdapterMiddy).type.not.toBeCallableWith({
			split: { admin: 1 },
		});
		expect(sveltekitAdapterMiddy).type.not.toBeCallableWith({
			esbuildOptions: { minify: "yes" },
		});
	});
});
