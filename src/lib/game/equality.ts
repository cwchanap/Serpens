/**
 * Structural equality for JSON-like data (no Date/Map/Set/class instances).
 *
 * Iterative, worklist-based comparison with a 250k-node cap and cycle
 * detection via WeakMap/WeakSet. Used by both the scenario runtime (command
 * dedup) and the persistence codec (validation of untrusted serialized data).
 *
 * The bound and cycle detection matter for the persistence path, which may
 * receive malformed or adversarial input. The runtime path trusts GameState
 * shape but benefits from the same safety.
 */
export function deeplyEqual(left: unknown, right: unknown): boolean {
	const worklist: Array<[unknown, unknown]> = [[left, right]];
	const compared = new WeakMap<object, WeakSet<object>>();
	let nodes = 0;
	while (worklist.length > 0) {
		const [first, second] = worklist.pop()!;
		if (Object.is(first, second)) continue;
		if (
			typeof first !== 'object' ||
			first === null ||
			typeof second !== 'object' ||
			second === null
		) {
			return false;
		}
		nodes += 1;
		if (nodes > 250_000) return false;
		let seconds = compared.get(first);
		if (seconds?.has(second)) continue;
		if (!seconds) {
			seconds = new WeakSet<object>();
			compared.set(first, seconds);
		}
		seconds.add(second);
		const firstIsArray = Array.isArray(first);
		const secondIsArray = Array.isArray(second);
		if (firstIsArray || secondIsArray) {
			if (!firstIsArray || !secondIsArray) return false;
			const firstArray = first as unknown[];
			const secondArray = second as unknown[];
			if (firstArray.length !== secondArray.length) return false;
			for (let index = 0; index < firstArray.length; index += 1) {
				worklist.push([firstArray[index], secondArray[index]]);
			}
			continue;
		}
		if (!isRecord(first) || !isRecord(second)) return false;
		const firstKeys = Object.keys(first);
		const secondKeys = Object.keys(second);
		if (firstKeys.length !== secondKeys.length) return false;
		for (const key of firstKeys) {
			if (!Object.hasOwn(second, key)) return false;
			worklist.push([first[key], second[key]]);
		}
	}
	return true;
}

function isRecord(value: object): value is Record<string, unknown> {
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
}
