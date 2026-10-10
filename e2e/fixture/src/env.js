import { defineEnvVars } from "@sveltejs/kit/env";

// Read when the app starts; optional, so the build runs without it
export const variables = defineEnvVars({
	E2E_SECRET: { schema: (value) => value },
});
