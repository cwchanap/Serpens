// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Vite `?raw` imports (used by route wiring pins in page.svelte.spec.ts).
declare module '*?raw' {
	const content: string;
	export default content;
}

export {};
