// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const name = "sveltekit-adapter-middy";
const files = fileURLToPath(new URL("./", import.meta.url));

// `src/routes/admin/handler.js` -> `/admin`, matching the route id: layout
// groups `(app)` are stripped, param segments `[[lang]]` are kept as written
const routeHandlers = (routesDir) =>
	new Map(
		readdirSync(routesDir, { recursive: true })
			.filter((file) => basename(file) === "handler.js")
			.map((file) => [
				`/${dirname(file)
					.split(sep)
					.filter((segment) => segment !== "." && !segment.startsWith("("))
					.join("/")}`,
				join(routesDir, file),
			]),
	);

// Specific beats global, explicit beats implicit: the entry's own `handlerPath`,
// then a handler beside the route, then the top-level `handlerPath`, then
// `src/handler.js`, then the built-in. A configured path that isn't there throws
// rather than silently deploying the wrong middleware stack.
export const resolveHandler = (entry, { routesDir, handlerPath, builtin }) => {
	const configured = (path) => {
		if (!existsSync(path)) {
			throw new Error(`${name}: handlerPath not found: ${path}`);
		}
		return path;
	};

	if (entry.handlerPath) return configured(entry.handlerPath);
	// Function prefixes and `index` (no prefix) never match a route id key
	const local = routeHandlers(routesDir).get(entry.prefix);
	if (local) return local;
	if (handlerPath) return configured(handlerPath);
	const project = join(dirname(routesDir), "handler.js");
	return existsSync(project) ? project : builtin;
};

// Routes matching an entry prefix go to that entry, everything else to `index`.
// Prefixes match route ids, so param segments are written out: `/[[lang]]/admin`.
// A function prefix covers anything a string can't express.
const matches = ({ prefix }, route) =>
	typeof prefix === "function"
		? prefix(route)
		: route.id === prefix || route.id.startsWith(`${prefix}/`);

// Specific beats global: the longest string prefix is tried first, function
// prefixes last in the order given
const specificity = ({ prefix }) =>
	typeof prefix === "string" ? prefix.length : -1;

export const splitRoutes = (routes, entries) => {
	const split = { index: [] };
	for (const { name } of entries) split[name] = [];
	const ordered = entries.toSorted((a, b) => specificity(b) - specificity(a));
	for (const route of routes) {
		const owner = ordered.find((entry) => matches(entry, route));
		split[owner?.name ?? "index"].push(route);
	}
	return split;
};

// Stryker disable all: build glue (log text, esbuild options), exercised by the adapt tests

// The handler is bundled where it lives, so its own relative imports resolve;
// only the adapter's files point into the build directory
const adapterFiles = (dir) => ({
	name: "adapter-middy",
	setup(build) {
		build.onResolve(
			{ filter: /^\.\/sveltekit(Handler|Middleware)\.js$/ },
			({ path }) => ({ path: join(dir, path) }),
		);
	},
});

const sveltekitAdapterMiddy = (opts = {}) => {
	const { out = "build", handlerPath, esbuildOptions = {}, split = {} } = opts;
	if (Object.hasOwn(split, "index")) {
		throw new Error(`${name}: split entry name "index" is reserved`);
	}

	return {
		name,
		async adapt(builder) {
			const tmp = builder.getBuildDirectory("adapter-middy");

			builder.rimraf(out);
			builder.rimraf(tmp);

			builder.log.minor("Copying static assets");
			await builder.writeClient(`${out}/assets${builder.config.paths.base}`);

			await builder.writeServer(tmp);

			builder.copy(
				`${files}sveltekitMiddleware.js`,
				`${tmp}/sveltekitMiddleware.js`,
			);
			builder.copy(`${files}sveltekitHandler.js`, `${tmp}/sveltekitHandler.js`);

			const entries = Object.entries(split).map(([name, value]) => {
				const config = typeof value === "object" ? value : { prefix: value };
				return {
					name,
					prefix: config.prefix,
					handlerPath: config.handlerPath,
				};
			});
			// Like Kit's default, fully prerendered routes stay out of the server
			const routes = splitRoutes(
				builder.routes.filter((route) => route.prerender !== true),
				entries,
			);
			for (const { name: entryName } of entries) {
				if (routes[entryName].length === 0) {
					builder.log.warn(
						`${name}: split entry ${entryName} matches no routes`,
					);
				}
			}
			entries.push({ name: "index" });

			// Instrumentation (eg OpenTelemetry) loads before the app, with
			// the private env (`$app/env/private`) set. One bundle, so the app shares its env module.
			const initializer =
				builder.hasServerInstrumentationFile() &&
				builder.createInstrumentationInitializer({
					outputDirectory: tmp,
					serverDirectory: tmp,
				});
			const instrumented = (entryHandler) => {
				const entry = join(tmp, "instrumented.js");
				writeFileSync(
					entry,
					[
						`import ${JSON.stringify(initializer)};`,
						`import ${JSON.stringify(join(tmp, "instrumentation.server.js"))};`,
						`export const { handler } = await import(${JSON.stringify(entryHandler)});`,
					].join("\n"),
				);
				return entry;
			};

			const resolveOptions = {
				routesDir: builder.config.files.routes,
				handlerPath,
				builtin: `${files}handler.js`,
			};

			try {
				for (const entry of entries) {
					const entryHandler = resolveHandler(entry, resolveOptions);
					builder.log.minor(`Building server: ${entry.name} (${entryHandler})`);
					builder.generateServerInstance(`${tmp}/server.js`, {
						routes: routes[entry.name],
						serverDirectory: tmp,
					});
					const result = await esbuild.build({
						target: "node26",
						bundle: true,
						platform: "node",
						format: "esm",
						treeShaking: true,
						// Reported once, through the builder log, below
						logLevel: "silent",
						...esbuildOptions,
						entryPoints: [
							initializer ? instrumented(entryHandler) : entryHandler,
						],
						outfile: `${out}/${entry.name}.mjs`,
						external: ["node:*", ...(esbuildOptions?.external ?? [])],
						plugins: [adapterFiles(tmp), ...(esbuildOptions?.plugins ?? [])],
					});

					const warnings = await esbuild.formatMessages(result.warnings, {
						kind: "warning",
					});
					for (const warning of warnings) builder.log.warn(warning);
				}
			} catch (err) {
				// Only esbuild failures carry `errors`, anything else is rethrown as is
				if (!Array.isArray(err?.errors)) throw err;
				const errors = await esbuild.formatMessages(err.errors, {
					kind: "error",
				});
				for (const error of errors) builder.log.error(error);

				throw new Error(
					`Bundling with esbuild failed with ${err.errors.length} ${
						err.errors.length === 1 ? "error" : "errors"
					}`,
				);
			}

			builder.log.minor("Prerendering static pages");
			await builder.writePrerendered(
				`${out}/prerendered${builder.config.paths.base}`,
			);
		},
		supports: {
			read: () => false,
			instrumentation: () => true,
		},
		// `vite dev` and prerendering run outside Lambda; middleware values on
		// `context` only exist there
		emulate: () => ({ platform: () => ({ event: {}, context: {} }) }),
	};
};
export default sveltekitAdapterMiddy;
