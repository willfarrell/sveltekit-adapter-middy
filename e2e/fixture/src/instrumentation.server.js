import { E2E_SECRET } from "$app/env/private";

// Runs before the app, with the private env already set
globalThis.instrumentation = { secret: E2E_SECRET };
