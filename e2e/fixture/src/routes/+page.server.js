// Read as the module loads, so only instrumentation that ran first is seen
const { instrumentation } = globalThis;

export const load = ({ cookies, platform }) => ({
	instrumented: instrumentation?.secret,
	session: cookies.get("session"),
	functionName: platform.context.functionName,
});

export const actions = {
	login: ({ cookies }) => {
		cookies.set("session", "new", { path: "/" });
	},
};
