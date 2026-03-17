// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import middy from "@middy/core";
import { executionModeStreamifyResponse } from "@middy/core/StreamifyResponse";
import sveltekitHandler from "./sveltekitHandler.js";
import sveltekitMiddleware from "./sveltekitMiddleware.js";

export const handler = middy({ executionMode: executionModeStreamifyResponse })
	.use([
		// other middleware here
		sveltekitMiddleware(),
	])
	.handler(sveltekitHandler);
