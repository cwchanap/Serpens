export type AudioChannel = 'bgm' | 'sfx';

export type BgmCueId = 'bgm.retail-map' | 'bgm.industry-map' | 'bgm.world-map';

export type SfxCueId =
	| 'sfx.ui.click'
	| 'sfx.ui.menu-open'
	| 'sfx.ui.menu-close'
	| 'sfx.ui.panel-open'
	| 'sfx.ui.panel-close'
	| 'sfx.build.arm'
	| 'sfx.build.retail-place'
	| 'sfx.build.industry-place'
	| 'sfx.build.invalid'
	| 'sfx.time.advance-day'
	| 'sfx.world.city-unlock'
	| 'sfx.save.saved'
	| 'sfx.save.loaded'
	| 'sfx.staff.hire'
	| 'sfx.staff.assign'
	| 'sfx.staff.unassign'
	| 'sfx.staff.promote'
	| 'sfx.policy.change'
	| 'sfx.decision.resolve'
	| 'sfx.store.upgrade'
	| 'sfx.industry.upgrade'
	| 'sfx.stock.edit'
	| 'sfx.chain.feedback';

export type AudioCueId = BgmCueId | SfxCueId;
export type AudioAssetPath = `/assets/game/audio/${string}.mp3`;

export interface AudioCue {
	id: AudioCueId;
	channel: AudioChannel;
	path: AudioAssetPath;
	loop: boolean;
	description: string;
}

function freezeCueRecord<const Cues extends Record<string, AudioCue>>(
	cues: Cues
): Readonly<{ [CueId in keyof Cues]: Readonly<Cues[CueId]> }> {
	for (const cue of Object.values(cues)) {
		Object.freeze(cue);
	}

	return Object.freeze(cues) as Readonly<{ [CueId in keyof Cues]: Readonly<Cues[CueId]> }>;
}

export const BGM_CUES = freezeCueRecord({
	'bgm.retail-map': {
		id: 'bgm.retail-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/retail-map.mp3',
		loop: true,
		description: 'Retail city map background loop'
	},
	'bgm.industry-map': {
		id: 'bgm.industry-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/industry-map.mp3',
		loop: true,
		description: 'Industry city map background loop'
	},
	'bgm.world-map': {
		id: 'bgm.world-map',
		channel: 'bgm',
		path: '/assets/game/audio/bgm/world-map.mp3',
		loop: true,
		description: 'World map background loop'
	}
} satisfies Record<BgmCueId, AudioCue>);

export const SFX_CUES = freezeCueRecord({
	'sfx.ui.click': {
		id: 'sfx.ui.click',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-click.mp3',
		loop: false,
		description: 'UI click confirmation'
	},
	'sfx.ui.menu-open': {
		id: 'sfx.ui.menu-open',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-menu-open.mp3',
		loop: false,
		description: 'Menu opened'
	},
	'sfx.ui.menu-close': {
		id: 'sfx.ui.menu-close',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-menu-close.mp3',
		loop: false,
		description: 'Menu closed'
	},
	'sfx.ui.panel-open': {
		id: 'sfx.ui.panel-open',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-panel-open.mp3',
		loop: false,
		description: 'Panel opened'
	},
	'sfx.ui.panel-close': {
		id: 'sfx.ui.panel-close',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/ui-panel-close.mp3',
		loop: false,
		description: 'Panel closed'
	},
	'sfx.build.arm': {
		id: 'sfx.build.arm',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-arm.mp3',
		loop: false,
		description: 'Build placement armed'
	},
	'sfx.build.retail-place': {
		id: 'sfx.build.retail-place',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-retail-place.mp3',
		loop: false,
		description: 'Retail building placed'
	},
	'sfx.build.industry-place': {
		id: 'sfx.build.industry-place',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-industry-place.mp3',
		loop: false,
		description: 'Industry building placed'
	},
	'sfx.build.invalid': {
		id: 'sfx.build.invalid',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/build-invalid.mp3',
		loop: false,
		description: 'Invalid build placement'
	},
	'sfx.time.advance-day': {
		id: 'sfx.time.advance-day',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/time-advance-day.mp3',
		loop: false,
		description: 'Day advanced'
	},
	'sfx.world.city-unlock': {
		id: 'sfx.world.city-unlock',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/world-city-unlock.mp3',
		loop: false,
		description: 'World city unlocked'
	},
	'sfx.save.saved': {
		id: 'sfx.save.saved',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/save-saved.mp3',
		loop: false,
		description: 'Save completed'
	},
	'sfx.save.loaded': {
		id: 'sfx.save.loaded',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/save-loaded.mp3',
		loop: false,
		description: 'Save loaded'
	},
	'sfx.staff.hire': {
		id: 'sfx.staff.hire',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-hire.mp3',
		loop: false,
		description: 'Staff hired'
	},
	'sfx.staff.assign': {
		id: 'sfx.staff.assign',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-assign.mp3',
		loop: false,
		description: 'Staff assigned'
	},
	'sfx.staff.unassign': {
		id: 'sfx.staff.unassign',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-unassign.mp3',
		loop: false,
		description: 'Staff unassigned'
	},
	'sfx.staff.promote': {
		id: 'sfx.staff.promote',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/staff-promote.mp3',
		loop: false,
		description: 'Staff promoted'
	},
	'sfx.policy.change': {
		id: 'sfx.policy.change',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/policy-change.mp3',
		loop: false,
		description: 'Policy changed'
	},
	'sfx.decision.resolve': {
		id: 'sfx.decision.resolve',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/decision-resolve.mp3',
		loop: false,
		description: 'Decision resolved'
	},
	'sfx.store.upgrade': {
		id: 'sfx.store.upgrade',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/store-upgrade.mp3',
		loop: false,
		description: 'Store upgraded'
	},
	'sfx.industry.upgrade': {
		id: 'sfx.industry.upgrade',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/industry-upgrade.mp3',
		loop: false,
		description: 'Industry building upgraded'
	},
	'sfx.stock.edit': {
		id: 'sfx.stock.edit',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/stock-edit.mp3',
		loop: false,
		description: 'Stock setting changed'
	},
	'sfx.chain.feedback': {
		id: 'sfx.chain.feedback',
		channel: 'sfx',
		path: '/assets/game/audio/sfx/chain-feedback.mp3',
		loop: false,
		description: 'Product chain feedback'
	}
} satisfies Record<SfxCueId, AudioCue>);

export const AUDIO_CUES = Object.freeze([
	...Object.values(BGM_CUES),
	...Object.values(SFX_CUES)
] satisfies Readonly<AudioCue>[]);

const AUDIO_CUES_BY_ID = new Map<AudioCueId, Readonly<AudioCue>>(
	AUDIO_CUES.map((cue) => [cue.id, cue])
);

export function getAudioCue(cueId: AudioCueId): Readonly<AudioCue> {
	const cue = AUDIO_CUES_BY_ID.get(cueId);

	if (!cue) {
		throw new Error(`Unknown audio cue: ${cueId}`);
	}

	return cue;
}
