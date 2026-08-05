import { describe, expect, test } from 'vitest';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { createSaveRecord, validateCurrentGameState, validateSaveRecord } from './saveCodec';

function makeRecord() {
	const game = createNewGame('convenience', 20260719);
	return createSaveRecord(game, {
		id: 'manual-coverage',
		name: 'Coverage',
		kind: 'manual',
		updatedAt: new Date('2026-07-19T00:00:00.000Z')
	});
}

function withRails(rails: Array<{ x: number; y: number; level: number }>) {
	const record = makeRecord();
	return {
		...record,
		game: {
			...record.game,
			industryCities: record.game.industryCities.map((city, index) =>
				index === 0 ? { ...city, rails } : city
			)
		}
	};
}

function gameWithTwoReports() {
	return simulateDay(simulateDay(makeRecord().game));
}

describe('rail save validation edge cases', () => {
	test('accepts a unique in-bounds rail cell', () => {
		expect(
			validateSaveRecord(withRails([{ x: 1, y: 1, level: 1 }])).game.industryCities[0]?.rails
		).toEqual([{ x: 1, y: 1, level: 1 }]);
	});

	test('rejects fractional x coordinates', () => {
		expect(() => validateSaveRecord(withRails([{ x: 1.5, y: 1, level: 1 }]))).toThrow(
			'x must be an integer'
		);
	});

	test('rejects fractional y coordinates', () => {
		expect(() => validateSaveRecord(withRails([{ x: 1, y: 1.5, level: 1 }]))).toThrow(
			'y must be an integer'
		);
	});

	test('rejects negative and out-of-bounds coordinates', () => {
		expect(() => validateSaveRecord(withRails([{ x: -1, y: 1, level: 1 }]))).toThrow(
			'must map to a valid city grid tile'
		);
		expect(() => validateSaveRecord(withRails([{ x: 999, y: 1, level: 1 }]))).toThrow(
			'must map to a valid city grid tile'
		);
	});

	test('rejects duplicate coordinates', () => {
		expect(() =>
			validateSaveRecord(
				withRails([
					{ x: 1, y: 1, level: 1 },
					{ x: 1, y: 1, level: 2 }
				])
			)
		).toThrow('duplicates rail coordinate 1,1');
	});

	test('rejects rail levels outside the supported integer range', () => {
		expect(() => validateSaveRecord(withRails([{ x: 1, y: 1, level: 0 }]))).toThrow(
			'level must be an integer between 1 and 5'
		);
		expect(() => validateSaveRecord(withRails([{ x: 1, y: 1, level: 1.5 }]))).toThrow(
			'level must be an integer between 1 and 5'
		);
	});
});

describe('historical report validation', () => {
	test('preserves structurally valid reports in their original order without replaying chronology', () => {
		const game = gameWithTwoReports();
		const reports = [game.reports[1]!, game.reports[0]!];

		expect(validateCurrentGameState({ ...game, reports }).reports).toEqual(reports);
	});
});
