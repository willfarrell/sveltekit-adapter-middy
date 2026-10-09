export const load = ({ cookies, platform }) => ({
	session: cookies.get("session"),
	functionName: platform.context.functionName,
});

export const actions = {
	login: ({ cookies }) => {
		cookies.set("session", "new", { path: "/" });
	},
};
