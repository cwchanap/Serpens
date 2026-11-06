import type { SfxCueId } from '$lib/audio/audioCatalog';
import type { GameState } from '$lib/game/types';
import type { I18nBundle, TranslationKey } from '$lib/i18n';
import { SaveDataError } from '$lib/persistence/saveCodec';
import type {
	SaveSlotMetadata,
	SaveStoreDiagnostic,
	SaveSummary
} from '$lib/persistence/saveTypes';
import type { GameRouteController } from './gameRouteController';

export type SaveUiCommands = Pick<
	GameRouteController,
	| 'initializeSaves'
	| 'refreshSaveSummary'
	| 'resumeAutoSave'
	| 'saveManualSlot'
	| 'loadManualSave'
	| 'deleteManualSlot'
>;

interface SaveUiOptions {
	getGame(): GameState | null;
	getI18n(): I18nBundle;
	commands: SaveUiCommands;
	playSfx(cueId: SfxCueId): void;
	onOpen(): void;
	onLoaded(): void;
}

interface SaveFeedback {
	kind: 'status' | 'error';
	messageKey: TranslationKey;
	params?: Record<string, string | number>;
}

function describeSaveErrorKey(error: unknown): TranslationKey {
	console.error('Save operation failed:', error);
	if (error instanceof SaveDataError) {
		switch (error.code) {
			case 'storage-unavailable':
				return 'route.save.errorStorageUnavailable';
			case 'slot-not-found':
				return 'route.save.errorSlotNotFound';
			default:
				return 'route.save.errorCorrupt';
		}
	}
	return 'route.save.errorGeneric';
}

export function createSaveUi(options: SaveUiOptions) {
	let isOpen = $state(false);
	let autoSave = $state<SaveSlotMetadata | null>(null);
	let manualSlots = $state<SaveSlotMetadata[]>([]);
	let diagnostics = $state<SaveStoreDiagnostic[]>([]);
	let feedback = $state<SaveFeedback | null>(null);

	function renderFeedback(value: SaveFeedback): string {
		const i18n = options.getI18n();
		const params = value.params ? { ...value.params } : undefined;
		if (params && typeof params.day === 'number') params.day = i18n.format.integer(params.day);
		return i18n.t(value.messageKey, params);
	}

	function acceptAutoSaveError(error: unknown): void {
		feedback = { kind: 'error', messageKey: describeSaveErrorKey(error) };
	}

	async function refreshSummary(): Promise<void> {
		await options.commands.refreshSaveSummary();
	}

	return {
		get isOpen() {
			return isOpen;
		},
		get autoSave() {
			return autoSave;
		},
		get manualSlots() {
			return manualSlots;
		},
		get diagnostics() {
			return diagnostics;
		},
		get status() {
			return feedback?.kind === 'status' ? renderFeedback(feedback) : '';
		},
		get error() {
			return feedback?.kind === 'error' ? renderFeedback(feedback) : null;
		},
		open(): void {
			options.onOpen();
			isOpen = true;
			feedback = null;
			void refreshSummary().catch(acceptAutoSaveError);
		},
		close(): void {
			isOpen = false;
		},
		async initialize(): Promise<void> {
			try {
				await options.commands.initializeSaves();
			} catch (error) {
				acceptAutoSaveError(error);
			}
		},
		refreshSummary,
		async resumeAutoSave(): Promise<void> {
			try {
				const result = await options.commands.resumeAutoSave();
				if (result !== 'loaded') {
					feedback = { kind: 'status', messageKey: 'route.save.noAutoSaveFound' };
					return;
				}
				options.onLoaded();
				feedback = { kind: 'status', messageKey: 'route.save.loadedAutoSave' };
				await refreshSummary();
			} catch (error) {
				acceptAutoSaveError(error);
			}
		},
		async saveManualSlot(name: string, slotId?: string): Promise<void> {
			try {
				// The controller saves its raw game; null retains its not-ready no-op.
				const metadata = await options.commands.saveManualSlot(name, slotId);
				if (!metadata) return;
				feedback = {
					kind: 'status',
					messageKey: 'route.save.savedManualSlot',
					params: { name: metadata.name }
				};
				await refreshSummary();
				options.playSfx('sfx.save.saved');
			} catch (error) {
				acceptAutoSaveError(error);
			}
		},
		async loadManualSlot(slotId: string): Promise<void> {
			try {
				const name = manualSlots.find((slot) => slot.id === slotId)?.name ?? slotId;
				const result = await options.commands.loadManualSave(slotId);
				if (result !== 'loaded') {
					feedback = { kind: 'status', messageKey: 'route.save.manualSlotNotFound' };
					return;
				}
				options.onLoaded();
				feedback = { kind: 'status', messageKey: 'route.save.loadedManualSlot', params: { name } };
				await refreshSummary();
			} catch (error) {
				acceptAutoSaveError(error);
			}
		},
		async deleteManualSlot(slotId: string): Promise<void> {
			try {
				const deleted = await options.commands.deleteManualSlot(slotId);
				if (!deleted) return;
				feedback = { kind: 'status', messageKey: 'route.save.deletedManualSlot' };
				await refreshSummary();
			} catch (error) {
				acceptAutoSaveError(error);
			}
		},
		acceptSummary(summary: SaveSummary): void {
			autoSave = summary.autoSave;
			manualSlots = summary.manualSlots;
			diagnostics = summary.diagnostics;
		},
		acceptAutoSave(metadata: SaveSlotMetadata): void {
			autoSave = metadata;
			feedback = {
				kind: 'status',
				messageKey: 'route.save.autoSavedDay',
				params: { day: metadata.day }
			};
		},
		acceptAutoSaveError
	};
}
