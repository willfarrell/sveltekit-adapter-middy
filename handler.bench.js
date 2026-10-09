import { bench, suite } from "node:bench";
import lambdaHandler from "./sveltekitHandler.js";

const makeEvent = (method = "GET", path = "/") => ({
	headers: { origin: "https://example.com", "content-type": "text/html" },
	rawQueryString: "",
	body: null,
	isBase64Encoded: false,
	requestContext: { http: { method, path } },
});

const nullServer = { respond: async () => null };
const ops = 100;

suite("sveltekit-adapter-middy", () => {
	bench("GET request - 404", { warmup: 10, samples: 30 }, async (b) => {
		b.start();
		for (let i = 0; i < ops; i++) {
			await lambdaHandler(
				makeEvent(),
				{ server: nullServer },
				{ signal: new AbortController().signal },
			);
		}
		b.end(ops);
	});

	bench(
		"GET with query string - 404",
		{ warmup: 10, samples: 30 },
		async (b) => {
			b.start();
			for (let i = 0; i < ops; i++) {
				const event = makeEvent();
				event.rawQueryString = "foo=bar&baz=qux";
				await lambdaHandler(
					event,
					{ server: nullServer },
					{ signal: new AbortController().signal },
				);
			}
			b.end(ops);
		},
	);
});
