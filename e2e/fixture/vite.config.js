import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "../../index.js";

export default {
	plugins: [sveltekit({ adapter: adapter({ split: { admin: "/admin" } }) })],
};
