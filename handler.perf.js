import test from "node:test";
import { Bench } from "tinybench";
import lambdaHandler from "./sveltekitHandler.js";

test("perf: request/response transformation benchmarks", async () => {
	const suite = new Bench({ name: "sveltekit-adapter-middy" });

	const makeEvent = (method = "GET", path = "/") => ({
		headers: { origin: "https://example.com", "content-type": "text/html" },
		rawQueryString: "",
		body: null,
		isBase64Encoded: false,
		requestContext: { http: { method, path } },
	});

	const nullServer = { respond: async () => null };

	suite
		.add("GET request - 404", async () => {
			await lambdaHandler(
				makeEvent(),
				{ server: nullServer, env: {} },
				{ signal: new AbortController().signal },
			);
		})
		.add("GET with query string - 404", async () => {
			const event = makeEvent();
			event.rawQueryString = "foo=bar&baz=qux";
			await lambdaHandler(
				event,
				{ server: nullServer, env: {} },
				{ signal: new AbortController().signal },
			);
		});

	await suite.run();
	console.table(suite.table());
});
