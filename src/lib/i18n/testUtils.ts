export interface FlattenedStringEntry {
	key: string;
	value: string;
}

export function flattenStrings(
	value: unknown,
	path: string[] = [],
	output: FlattenedStringEntry[] = []
): FlattenedStringEntry[] {
	if (typeof value === 'string') {
		output.push({ key: path.join('.'), value });
		return output;
	}

	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value)) {
			flattenStrings(nested, [...path, key], output);
		}
	}

	return output;
}
