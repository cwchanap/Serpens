export interface Rng {
	next: () => number;
	getState: () => number;
}

const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

export function normalizeSeed(seed: number): number {
	if (!Number.isFinite(seed)) {
		return 1;
	}

	const normalized = Math.floor(Math.abs(seed)) % MODULUS;
	return normalized === 0 ? 1 : normalized;
}

export function createRng(seed: number): Rng {
	let state = normalizeSeed(seed);

	return {
		next: () => {
			state = (state * MULTIPLIER) % MODULUS;
			return state / MODULUS;
		},
		getState: () => state
	};
}

export function createRngFromState(state: number): Rng {
	return createRng(state);
}

export function randomBetween(rng: Rng, min: number, max: number): number {
	return min + (max - min) * rng.next();
}

export function randomInt(rng: Rng, min: number, max: number): number {
	return Math.floor(randomBetween(rng, min, max + 1));
}
