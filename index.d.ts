// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import type { Adapter, RouteDefinition } from "@sveltejs/kit";
import type { BuildOptions } from "esbuild";

type Prefix = string | ((route: RouteDefinition) => boolean);

interface SplitEntry {
	prefix: Prefix;
	handlerPath?: string;
}

export interface Options {
	out?: string;
	handlerPath?: string;
	esbuildOptions?: BuildOptions;
	split?: Record<string, Prefix | SplitEntry>;
}

declare function sveltekitAdapterMiddy(opts?: Options): Adapter;
export default sveltekitAdapterMiddy;
