import { strictEqual } from "node:assert";
import test from "node:test";
import fc from "fast-check";
import lambdaHandler from "./sveltekitHandler.js";

// Shaped like what a Function URL can deliver: header names are tokens, values
// carry no control characters, paths start with `/`
const tokenChar = fc.constantFrom(
	..."abcdefghijklmnopqrstuvwxyz0123456789!#$%&'*+-.^_`|~",
);
const valueChar = fc.constantFrom(
	..." !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
);

test("fuzz: random HTTP events are handled without throwing", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.record({
				headers: fc.dictionary(
					fc.string({ unit: tokenChar, minLength: 1, maxLength: 20 }),
					fc.string({ unit: valueChar, maxLength: 100 }),
				),
				cookies: fc.option(fc.array(fc.string({ unit: valueChar }))),
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
						path: fc.string({ maxLength: 100 }).map((path) => `/${path}`),
						sourceIp: fc.ipV4(),
					}),
				}),
			}),
			async (event) => {
				event.headers.host = "example.com";
				const result = await lambdaHandler(
					event,
					{
						server: {
							respond: async () => new Response(null, { status: 404 }),
						},
					},
					{ signal: new AbortController().signal },
				);
				strictEqual(result.statusCode, 404);
			},
		),
		{ numRuns: 500 },
	);
});
