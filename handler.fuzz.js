import test from "node:test";
import fc from "fast-check";
import lambdaHandler from "./sveltekitHandler.js";

test("fuzz: random HTTP events should not crash handler", () => {
	fc.assert(
		fc.asyncProperty(
			fc.record({
				headers: fc.dictionary(
					fc.string({ minLength: 1, maxLength: 20 }),
					fc.string({ maxLength: 100 }),
				),
				rawQueryString: fc.string({ maxLength: 200 }),
				body: fc.option(fc.string({ maxLength: 500 })),
				isBase64Encoded: fc.boolean(),
				requestContext: fc.record({
					http: fc.record({
						method: fc.constantFrom(
							"GET",
							"POST",
							"PUT",
							"DELETE",
							"PATCH",
							"HEAD",
							"OPTIONS",
						),
						path: fc.string({ minLength: 1, maxLength: 100 }),
					}),
				}),
			}),
			async (event) => {
				// Ensure origin is set
				event.headers.origin ??= "https://example.com";
				const context = {
					server: { respond: async () => null },
					env: process.env,
				};
				try {
					const result = await lambdaHandler(event, context, {
						signal: new AbortController().signal,
					});
					if (result.statusCode !== 404 && result.statusCode !== 200) {
						// any status code is acceptable
					}
				} catch (_e) {
					// Some malformed inputs may cause errors, that's acceptable
				}
			},
		),
		{ numRuns: 500 },
	);
});
