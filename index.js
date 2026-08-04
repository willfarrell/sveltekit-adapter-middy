// Copyright 2026 will Farrell, and sveltekit-adapter-middy contributors.
// SPDX-License-Identifier: MIT
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const name = "@middy/sveltekit";
const files = fileURLToPath(new URL("./", import.meta.url).href);

// Routes matching an entry prefix go to that entry, everything else to `index`.
// Prefixes match route ids, so param segments are written out: `/[[lang]]/admin`.
// A function prefix covers anything a string can't express.
const matches = ({ prefix }, route) =>
	typeof prefix === "function"
		? prefix(route)
		: route.id === prefix || route.id.startsWith(`${prefix}/`);

export const splitRoutes = (routes, entries) => {
	const split = { index: [] };
	for (const { name } of entries) split[name] = [];
	for (const route of routes) {
		const owner = entries.find((entry) => matches(entry, route));
		split[owner?.name ?? "index"].push(route);
	}
	return split;
};

const sveltekitAdapterMiddy = (opts = {}) => {
	const {
		out = "build",
		handlerPath = `${files}/handler.js`,
		esbuildOptions = {},
		split = {},
	} = opts;

	return {
		name,
		async adapt(builder) {
			const tmp = builder.getBuildDirectory("adapter-middy");

			builder.rimraf(out);
			builder.rimraf(tmp);

			builder.log.minor("Copying static assets");
			const _clientFiles = await builder.writeClient(
				`${out}/assets${builder.config.kit.paths.base}`,
			);

			await builder.writeServer(tmp);

			builder.copy(
				`${files}/sveltekitMiddleware.js`,
				`${tmp}/sveltekitMiddleware.js`,
			);
			builder.copy(
				`${files}/sveltekitHandler.js`,
				`${tmp}/sveltekitHandler.js`,
			);

			const entries = Object.entries(split).map(([name, value]) => {
				const config = typeof value === "object" ? value : { prefix: value };
				return {
					name,
					prefix: config.prefix,
					handlerPath: config.handlerPath ?? handlerPath,
				};
			});
			const routes = splitRoutes(builder.routes, entries);
			entries.push({ name: "index", handlerPath });

			try {
				// ponytail: sequential builds sharing one manifest.js, parallelize if build time matters
				for (const entry of entries) {
					builder.log.minor(`Building server: ${entry.name}`);
					writeFileSync(
						`${tmp}/manifest.js`,
						[
							`export const manifest = ${builder.generateManifest({
								relativePath: "./",
								routes: routes[entry.name],
							})};`,
							`export const prerendered = new Set(${JSON.stringify(
								builder.prerendered.paths,
							)});`,
							`export const base = ${JSON.stringify(
								builder.config.kit.paths.base,
							)};`,
						].join("\n\n"),
					);
					builder.copy(entry.handlerPath, `${tmp}/handler.js`);

					const result = await esbuild.build({
						target: "node24",
						bundle: true,
						platform: "node",
						format: "esm",
						treeShaking: true,
						...esbuildOptions,
						entryPoints: [`${tmp}/handler.js`],
						outfile: `${out}/${entry.name}.mjs`,
						external: ["node:*", ...(esbuildOptions?.external ?? [])],
					});

					if (result.warnings.length > 0) {
						const formatted = await esbuild.formatMessages(result.warnings, {
							kind: "warning",
							color: true,
						});

						console.error(formatted.join("\n"));
					}
				}
			} catch (err) {
				const formatted = await esbuild.formatMessages(err.errors, {
					kind: "error",
					color: true,
				});

				console.error(formatted.join("\n"));

				throw new Error(
					`Bundling with esbuild failed with ${err.errors.length} ${
						err.errors.length === 1 ? "error" : "errors"
					}`,
				);
			}

			builder.log.minor("Prerendering static pages");
			const _prerenderedFiles = await builder.writePrerendered(
				`${out}/prerendered${builder.config.kit.paths.base}`,
			);
		},
		supports: {
			read: () => true,
		},
	};
};
export default sveltekitAdapterMiddy;
