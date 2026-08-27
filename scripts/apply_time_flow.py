from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> int:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"{path}: expected at least {minimum} matches, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new))
    return count


# Route shortcut ownership: WASD belongs to Phaser; Space owns pause/resume.
replace_once(
    "src/lib/game/keyboardShortcuts.ts",
    "\t| { type: 'advance-day' }\n",
    "\t| { type: 'toggle-pause' }\n",
)
replace_once(
    "src/lib/game/keyboardShortcuts.ts",
    "\td: 'dashboard',\n\tp: 'policies',\n\ts: 'staff',\n",
    "\to: 'dashboard',\n\tp: 'policies',\n\th: 'staff',\n",
)
replace_once(
    "src/lib/game/keyboardShortcuts.ts",
    "\t\tcase ' ':\n\t\t\treturn context.hasGame ? { type: 'advance-day' } : null;\n",
    "\t\tcase ' ':\n\t\t\treturn context.hasGame ? { type: 'toggle-pause' } : null;\n",
)

# Control desk: replace manual day advance with pause/resume + fixed speed choices.
replace_once(
    "src/lib/components/game/ControlDesk.svelte",
    "\tinterface Props {\n\t\tmanagementItems: ManagementItem[];\n\t\tbuildDisabled: boolean;\n\t\tadvanceDisabled: boolean;\n\t\trailBuildDisabled?: boolean;\n\t\tdisabledReason?: string | null;\n\t\ti18n: I18nBundle;\n\t\tonBuild: () => void;\n\t\tonOpenManagement: (id: ManagementPanelId) => void;\n\t\tonAdvanceDay: () => void;\n\t\tonOpenShortcuts: () => void;\n",
    "\ttype SimulationSpeed = 1 | 2 | 5;\n\n\tinterface Props {\n\t\tmanagementItems: ManagementItem[];\n\t\tbuildDisabled: boolean;\n\t\tadvanceDisabled: boolean;\n\t\trailBuildDisabled?: boolean;\n\t\tdisabledReason?: string | null;\n\t\ti18n: I18nBundle;\n\t\tonBuild: () => void;\n\t\tonOpenManagement: (id: ManagementPanelId) => void;\n\t\tpaused?: boolean;\n\t\tsimulationSpeed?: SimulationSpeed;\n\t\tonTogglePause?: () => void;\n\t\tonSelectSpeed?: (speed: SimulationSpeed) => void;\n\t\tonOpenShortcuts: () => void;\n",
)
replace_once(
    "src/lib/components/game/ControlDesk.svelte",
    "\t\tonBuild,\n\t\tonOpenManagement,\n\t\tonAdvanceDay,\n\t\tonOpenShortcuts,\n",
    "\t\tonBuild,\n\t\tonOpenManagement,\n\t\tpaused = false,\n\t\tsimulationSpeed = 1,\n\t\tonTogglePause = () => {},\n\t\tonSelectSpeed = () => {},\n\t\tonOpenShortcuts,\n",
)
replace_once(
    "src/lib/components/game/ControlDesk.svelte",
    """\t\t<button
\t\t\ttype=\"button\"
\t\t\tclass=\"btn-primary advance\"
\t\t\taria-label={i18n.t('controlDesk.advanceDay')}
\t\t\tdisabled={advanceDisabled}
\t\t\tonclick={onAdvanceDay}
\t\t>
\t\t\t{i18n.t('controlDesk.advanceDay')} <kbd class=\"keycap\">Space</kbd>
\t\t</button>
""",
    """\t\t<button
\t\t\ttype=\"button\"
\t\t\tclass=\"btn-primary advance\"
\t\t\taria-label={paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
\t\t\tdisabled={advanceDisabled}
\t\t\tonclick={onTogglePause}
\t\t>
\t\t\t{paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
\t\t\t<kbd class=\"keycap\">Space</kbd>
\t\t</button>
\t\t<div class=\"speed-controls\" role=\"group\" aria-label={i18n.t('controlDesk.simulationSpeed')}>
\t\t\t{#each [1, 2, 5] as speed}
\t\t\t\t<button
\t\t\t\t\ttype=\"button\"
\t\t\t\t\tclass=\"speed-button\"
\t\t\t\t\tclass:active={simulationSpeed === speed}
\t\t\t\t\taria-label={`${speed}×`}
\t\t\t\t\taria-pressed={simulationSpeed === speed}
\t\t\t\t\tdisabled={advanceDisabled}
\t\t\t\t\tonclick={() => onSelectSpeed(speed as SimulationSpeed)}
\t\t\t\t>
\t\t\t\t\t{speed}×
\t\t\t\t</button>
\t\t\t{/each}
\t\t</div>
""",
)
replace_once(
    "src/lib/components/game/ControlDesk.svelte",
    """\t.advance {
\t\tdisplay: inline-flex;
\t\talign-items: center;
\t}
""",
    """\t.advance {
\t\tdisplay: inline-flex;
\t\talign-items: center;
\t\tgap: 0.35rem;
\t}

\t.speed-controls {
\t\tdisplay: inline-flex;
\t\tgap: 0.2rem;
\t}

\t.speed-button {
\t\tborder: 1px solid var(--paper-edge);
\t\tborder-radius: 2px;
\t\tbackground: var(--paper-50);
\t\tcolor: var(--ink-700);
\t\tfont-family: var(--font-ui);
\t\tfont-size: 0.82rem;
\t\tfont-weight: 700;
\t\tpadding: 0.45rem 0.55rem;
\t}

\t.speed-button.active {
\t\tborder-color: var(--brass-500);
\t\tbackground: var(--paper-200);
\t}
""",
)

# Shortcut help follows the new ownership.
replace_once(
    "src/lib/components/game/ShortcutCheatSheet.svelte",
    "\t\t| 'build'\n\t\t| 'mapViews'\n",
    "\t\t| 'build'\n\t\t| 'cameraPan'\n\t\t| 'mapViews'\n",
)
replace_once(
    "src/lib/components/game/ShortcutCheatSheet.svelte",
    "\t\t| 'advanceDay'\n",
    "\t\t| 'pauseResume'\n",
)
replace_once(
    "src/lib/components/game/ShortcutCheatSheet.svelte",
    """\tconst shortcuts: Array<{ keys: string; actionKey: ShortcutActionKey }> = [
\t\t{ keys: 'B', actionKey: 'build' },
\t\t{ keys: '1 / 2 / 3', actionKey: 'mapViews' },
\t\t{ keys: 'D', actionKey: 'dashboard' },
\t\t{ keys: 'P', actionKey: 'policies' },
\t\t{ keys: 'S', actionKey: 'staff' },
""",
    """\tconst shortcuts: Array<{ keys: string; actionKey: ShortcutActionKey }> = [
\t\t{ keys: 'B', actionKey: 'build' },
\t\t{ keys: 'W / A / S / D', actionKey: 'cameraPan' },
\t\t{ keys: '1 / 2 / 3', actionKey: 'mapViews' },
\t\t{ keys: 'O', actionKey: 'dashboard' },
\t\t{ keys: 'P', actionKey: 'policies' },
\t\t{ keys: 'H', actionKey: 'staff' },
""",
)
replace_once(
    "src/lib/components/game/ShortcutCheatSheet.svelte",
    "\t\t{ keys: 'Space', actionKey: 'advanceDay' },\n",
    "\t\t{ keys: 'Space', actionKey: 'pauseResume' },\n",
)

# Retail wrapper receives the same overlay keyboard gate that industry already uses.
replace_once(
    "src/lib/components/game/CityMap.svelte",
    "\t\tpaused?: boolean;\n\t\ti18n: I18nBundle;\n",
    "\t\tpaused?: boolean;\n\t\tkeyboardEnabled?: boolean;\n\t\ti18n: I18nBundle;\n",
)
replace_once(
    "src/lib/components/game/CityMap.svelte",
    "\tlet { snapshot, onTileSelected, active = true, paused = false, i18n }: Props = $props();\n",
    """\tlet {
\t\tsnapshot,
\t\tonTileSelected,
\t\tactive = true,
\t\tpaused = false,
\t\tkeyboardEnabled = true,
\t\ti18n
\t}: Props = $props();
""",
)
replace_once(
    "src/lib/components/game/CityMap.svelte",
    "\t$effect(() => {\n\t\tscene?.updateSnapshot(snapshot);\n\t});\n\n",
    "\t$effect(() => {\n\t\tscene?.updateSnapshot(snapshot);\n\t});\n\n\t$effect(() => {\n\t\tscene?.setKeyboardEnabled(keyboardEnabled);\n\t});\n\n",
)
replace_once(
    "src/routes/MapSurfaceHost.svelte",
    "\t\t\t\tactive={activeMapView === 'retail'}\n\t\t\t\tpaused={isMapPaused}\n\t\t\t\t{i18n}\n",
    "\t\t\t\tactive={activeMapView === 'retail'}\n\t\t\t\tpaused={isMapPaused}\n\t\t\t\tkeyboardEnabled={railKeyboardEnabled}\n\t\t\t\t{i18n}\n",
)

# Continuous WASD movement lives in each Phaser scene, alongside drag pan / zoom.
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "const MAX_ZOOM = 2.2;\n",
    "const MAX_ZOOM = 2.2;\nconst KEYBOARD_PAN_SPEED = 420;\n",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "interface StoreSpriteRender {\n",
    "type CameraPanKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;\n\ninterface StoreSpriteRender {\n",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "\tprivate hasUserAdjustedCamera = false;\n",
    "\tprivate hasUserAdjustedCamera = false;\n\tprivate panKeys: CameraPanKeys | null = null;\n\tprivate keyboardEnabled = true;\n",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "\t\tthis.cameras.main.setZoom(1);\n\t\tthis.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);\n",
    "\t\tthis.cameras.main.setZoom(1);\n\t\tthis.panKeys =\n\t\t\t(this.input.keyboard?.addKeys('W,A,S,D') as CameraPanKeys | undefined) ?? null;\n\t\tthis.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);\n",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    """\tupdate(time: number): void {
\t\tthis.drawStoreMarkers(time);
\t\tthis.updateCanvasCameraAttributes();
\t}

\tsetEventHandler(handler: CityMapEventHandler | null): void {
""",
    """\tupdate(time: number, delta = 0): void {
\t\tthis.updateKeyboardPan(delta);
\t\tthis.drawStoreMarkers(time);
\t\tthis.updateCanvasCameraAttributes();
\t}

\tsetEventHandler(handler: CityMapEventHandler | null): void {
""",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "\tsetEventHandler(handler: CityMapEventHandler | null): void {\n\t\tthis.eventHandler = handler;\n\t}\n\n",
    "\tsetEventHandler(handler: CityMapEventHandler | null): void {\n\t\tthis.eventHandler = handler;\n\t}\n\n\tsetKeyboardEnabled(enabled: boolean): void {\n\t\tthis.keyboardEnabled = enabled;\n\t}\n\n",
)
replace_once(
    "src/lib/phaser/cityMapScene.ts",
    "\tprivate handlePointerUp(): void {\n",
    """\tprivate updateKeyboardPan(deltaMs: number): void {
\t\tif (!this.keyboardEnabled || !this.panKeys || deltaMs <= 0) {
\t\t\treturn;
\t\t}

\t\tconst horizontal = Number(this.panKeys.D.isDown) - Number(this.panKeys.A.isDown);
\t\tconst vertical = Number(this.panKeys.S.isDown) - Number(this.panKeys.W.isDown);
\t\tif (horizontal === 0 && vertical === 0) {
\t\t\treturn;
\t\t}

\t\tconst magnitude = Math.hypot(horizontal, vertical);
\t\tconst camera = this.cameras.main;
\t\tconst distance = (KEYBOARD_PAN_SPEED * (deltaMs / 1000)) / (camera.zoom || 1);
\t\tthis.hasUserAdjustedCamera = true;
\t\tcamera.scrollX += (horizontal / magnitude) * distance;
\t\tcamera.scrollY += (vertical / magnitude) * distance;
\t\tthis.updateCanvasCameraAttributes();
\t}

\tprivate handlePointerUp(): void {
""",
)

replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "const MAX_ZOOM = 2.2;\n",
    "const MAX_ZOOM = 2.2;\nconst KEYBOARD_PAN_SPEED = 420;\n",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "type BuildingStage = 'raw' | 'process' | 'final' | 'warehouse';\n",
    "type CameraPanKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;\ntype BuildingStage = 'raw' | 'process' | 'final' | 'warehouse';\n",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "\tprivate hasUserAdjustedCamera = false;\n",
    "\tprivate hasUserAdjustedCamera = false;\n\tprivate panKeys: CameraPanKeys | null = null;\n",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "\t\tthis.cameras.main.setZoom(1);\n\t\tthis.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);\n",
    "\t\tthis.cameras.main.setZoom(1);\n\t\tthis.panKeys =\n\t\t\t(this.input.keyboard?.addKeys('W,A,S,D') as CameraPanKeys | undefined) ?? null;\n\t\tthis.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);\n",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    """\tupdate(time: number): void {
\t\tthis.updateBuildingSprites(time);
\t\tthis.drawMarkerGraphics(time);
\t\tthis.updateCanvasCameraAttributes();
\t}
""",
    """\tupdate(time: number, delta = 0): void {
\t\tthis.updateKeyboardPan(delta);
\t\tthis.updateBuildingSprites(time);
\t\tthis.drawMarkerGraphics(time);
\t\tthis.updateCanvasCameraAttributes();
\t}
""",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "\tprivate handlePointerUp(): void {\n",
    """\tprivate updateKeyboardPan(deltaMs: number): void {
\t\tif (!this.keyboardEnabled || !this.panKeys || deltaMs <= 0) {
\t\t\treturn;
\t\t}

\t\tconst horizontal = Number(this.panKeys.D.isDown) - Number(this.panKeys.A.isDown);
\t\tconst vertical = Number(this.panKeys.S.isDown) - Number(this.panKeys.W.isDown);
\t\tif (horizontal === 0 && vertical === 0) {
\t\t\treturn;
\t\t}

\t\tconst magnitude = Math.hypot(horizontal, vertical);
\t\tconst camera = this.cameras.main;
\t\tconst distance = (KEYBOARD_PAN_SPEED * (deltaMs / 1000)) / (camera.zoom || 1);
\t\tthis.hasUserAdjustedCamera = true;
\t\tcamera.scrollX += (horizontal / magnitude) * distance;
\t\tcamera.scrollY += (vertical / magnitude) * distance;
\t\tthis.updateCanvasCameraAttributes();
\t}

\tprivate handlePointerUp(): void {
""",
)
replace_once(
    "src/lib/phaser/industryMapScene.ts",
    "\t * Enables or disables the scene's keyboard shortcuts (currently only the\n\t * Escape-to-cancel-build listener). Called by IndustryMap.svelte based on\n",
    "\t * Enables or disables the scene's keyboard controls (WASD camera pan and\n\t * Escape-to-cancel-build). Called by IndustryMap.svelte based on\n",
)

# Route-local automatic time flow: sequential atomic day commits, no new domain/save state.
replace_once(
    "src/routes/+page.svelte",
    "\ttype SaveFeedbackKind = 'status' | 'error';\n",
    "\ttype SimulationSpeed = 1 | 2 | 5;\n\ttype SaveFeedbackKind = 'status' | 'error';\n\n\tconst SIMULATION_DAY_MS = 5_000;\n",
)
replace_once(
    "src/routes/+page.svelte",
    "\tlet playMode = $state<'sandbox' | 'scenario'>('sandbox');\n\tlet scenarioCommandPending = $state(false);\n",
    "\tlet playMode = $state<'sandbox' | 'scenario'>('sandbox');\n\tlet simulationPaused = $state(false);\n\tlet simulationSpeed = $state<SimulationSpeed>(1);\n\tlet simulationTickPending = $state(false);\n\tlet scenarioCommandPending = $state(false);\n",
)
replace_once(
    "src/routes/+page.svelte",
    """\t$effect(() => {
\t\taudioController?.setActiveBgm(bgmCueByMapView[activeMapView]);
\t});

""",
    """\t$effect(() => {
\t\taudioController?.setActiveBgm(bgmCueByMapView[activeMapView]);
\t});

\t$effect(() => {
\t\tconst currentGame = game;
\t\tconst paused = simulationPaused;
\t\tconst speed = simulationSpeed;
\t\tconst canAdvance = mutationAvailability.advanceDay;
\t\tconst tickPending = simulationTickPending;

\t\tif (!currentGame || paused || !canAdvance || tickPending) {
\t\t\treturn;
\t\t}

\t\tconst timer = globalThis.setTimeout(
\t\t\t() => void runSimulationTick(),
\t\t\tSIMULATION_DAY_MS / speed
\t\t);
\t\treturn () => globalThis.clearTimeout(timer);
\t});

""",
)
replace_once(
    "src/routes/+page.svelte",
    """\tfunction advanceDay() {
\t\tif (game && mutationAvailability.advanceDay) {
\t\t\tvoid gameRouteController.advanceDay();
\t\t}
\t}
""",
    """\tasync function runSimulationTick(): Promise<void> {
\t\tif (
\t\t\t!game ||
\t\t\tsimulationPaused ||
\t\t\tsimulationTickPending ||
\t\t\t!mutationAvailability.advanceDay
\t\t) {
\t\t\treturn;
\t\t}

\t\tsimulationTickPending = true;
\t\ttry {
\t\t\tawait gameRouteController.advanceDay();
\t\t} finally {
\t\t\tsimulationTickPending = false;
\t\t}
\t}

\tfunction toggleSimulationPause(): void {
\t\tif (!game) return;
\t\tsimulationPaused = !simulationPaused;
\t}

\tfunction setSimulationSpeed(speed: SimulationSpeed): void {
\t\tsimulationSpeed = speed;
\t}
""",
)
replace_once(
    "src/routes/+page.svelte",
    "\t\t} else if (action.type === 'advance-day') {\n\t\t\tadvanceDay();\n",
    "\t\t} else if (action.type === 'toggle-pause') {\n\t\t\ttoggleSimulationPause();\n",
)
replace_once(
    "src/routes/+page.svelte",
    "\t\t\tonAdvanceDay={advanceDay}\n\t\t\tonOpenShortcuts={() => (isCheatSheetOpen = true)}\n",
    "\t\t\tpaused={simulationPaused}\n\t\t\tsimulationSpeed={simulationSpeed}\n\t\t\tonTogglePause={toggleSimulationPause}\n\t\t\tonSelectSpeed={setSimulationSpeed}\n\t\t\tonOpenShortcuts={() => (isCheatSheetOpen = true)}\n",
)

# Automatic ticks should not emit the old manual-advance sound every 1s at 5×.
replace_once(
    "src/routes/gameRouteController.ts",
    "\t\t\tscenarioCommand: { kind: 'advanceDay' },\n\t\t\tcueId: 'sfx.time.advance-day'\n",
    "\t\t\tscenarioCommand: { kind: 'advanceDay' }\n",
)

# Localized labels for the new controls and shortcut sheet rows.
locale_control = {
    "src/lib/i18n/messages/en.ts": ("Pause", "Resume", "Simulation speed"),
    "src/lib/i18n/messages/ja.ts": ("一時停止", "再開", "シミュレーション速度"),
    "src/lib/i18n/messages/zh-Hant.ts": ("暫停", "繼續", "模擬速度"),
}
for path, (pause, resume, speed) in locale_control.items():
    replace_once(
        path,
        "\t\tshortcuts: " + ("'Shortcuts',\n" if path.endswith("en.ts") else ("'ショートカット',\n" if path.endswith("ja.ts") else "'快捷鍵',\n")),
        "\t\tshortcuts: " + ("'Shortcuts',\n" if path.endswith("en.ts") else ("'ショートカット',\n" if path.endswith("ja.ts") else "'快捷鍵',\n"))
        + f"\t\tpause: '{pause}',\n\t\tresume: '{resume}',\n\t\tsimulationSpeed: '{speed}',\n",
    )

shortcut_copy = {
    "src/lib/i18n/messages/en.ts": ("Pan camera", "Pause or resume time"),
    "src/lib/i18n/messages/ja.ts": ("カメラを移動", "時間を一時停止・再開"),
    "src/lib/i18n/messages/zh-Hant.ts": ("平移鏡頭", "暫停或繼續時間"),
}
for path, (camera, pause_resume) in shortcut_copy.items():
    text = read(path)
    marker = "\t\t\tbuild: "
    start = text.find(marker, text.find("shortcutCheatSheet:"))
    if start == -1:
        raise RuntimeError(f"{path}: shortcut action build marker not found")
    line_end = text.find("\n", start) + 1
    text = text[:line_end] + f"\t\t\tcameraPan: '{camera}',\n" + text[line_end:]
    old_key = "\t\t\tadvanceDay: "
    key_pos = text.find(old_key, start)
    if key_pos == -1:
        raise RuntimeError(f"{path}: advanceDay shortcut copy not found")
    old_end = text.find("\n", key_pos) + 1
    text = text[:key_pos] + f"\t\t\tpauseResume: '{pause_resume}',\n" + text[old_end:]
    write(path, text)

# Component specs follow the new callbacks/hotkeys.
path = "src/lib/components/game/ControlDesk.svelte.spec.ts"
text = read(path)
text = text.replace("{ id: 'dashboard', label: 'Dashboard', shortcut: 'D' }", "{ id: 'dashboard', label: 'Dashboard', shortcut: 'O' }")
text = text.replace("\t\tonAdvanceDay: vi.fn(),\n", "\t\tpaused: false,\n\t\tsimulationSpeed: 1 as const,\n\t\tonTogglePause: vi.fn(),\n\t\tonSelectSpeed: vi.fn(),\n")
text = text.replace("'renders build, management launchers, and advance day'", "'renders build, management launchers, and time controls'")
text = text.replace("page.getByRole('button', { name: /^advance day$/i })", "page.getByRole('button', { name: /^pause$/i })")
text = text.replace("/dashboard\\s*d/i", "/dashboard\\s*o/i")
text = text.replace("'invokes build, management and advance callbacks on interaction'", "'invokes build, management and pause callbacks on interaction'")
text = text.replace("expect(props.onAdvanceDay).toHaveBeenCalledTimes(1);", "expect(props.onTogglePause).toHaveBeenCalledTimes(1);")
text = text.replace("'disables advance day when advanceDisabled is set'", "'disables time controls when advanceDisabled is set'")
text = text.replace("page.getByText('D', { exact: true })", "page.getByText('O', { exact: true })")
text = text.replace("const advance = page.getByRole('button', { name: /^pause$/i });", "const pause = page.getByRole('button', { name: /^pause$/i });")
text = text.replace("await expect.element(advance).toBeDisabled();", "await expect.element(pause).toBeDisabled();")
write(path, text)

replace_once(
    "src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts",
    "\t\t\tonAdvanceDay: vi.fn(),\n\t\t\tonOpenShortcuts: vi.fn()\n",
    "\t\t\tpaused: false,\n\t\t\tsimulationSpeed: 1,\n\t\t\tonTogglePause: vi.fn(),\n\t\t\tonSelectSpeed: vi.fn(),\n\t\t\tonOpenShortcuts: vi.fn()\n",
)

# New E2E loads the autosave explicitly before asserting automatic progression.
replace_once(
    "src/routes/time-flow.e2e.ts",
    "\t\tawait page.goto('/');\n\n\t\tconst day = page.getByText(/^Day \\d+$/);\n",
    "\t\tawait page.goto('/');\n\t\tawait page.getByRole('button', { name: /^menu$/i }).click();\n\t\tawait page.getByRole('button', { name: /^saves$/i }).click();\n\t\tawait page.getByRole('button', { name: /^resume$/i }).click();\n\n\t\tconst day = page.getByText(/^Day \\d+$/);\n",
)

# Existing E2E cases that need an exact one-day step use 5× briefly, then pause.
retail_path = "src/routes/retail-sim.e2e.ts"
retail = read(retail_path)
insert_after = """test.beforeEach(async ({ page }) => {
\tawait page.addInitScript(
\t\t({ languageKey, scenarioKey }) => {
\t\t\twindow.localStorage.setItem(languageKey, 'en');
\t\t\tconst isolationKey = 'serpens.e2e.challenge-storage-isolated';
\t\t\tif (window.sessionStorage.getItem(isolationKey) !== 'true') {
\t\t\t\twindow.localStorage.removeItem(scenarioKey);
\t\t\t\twindow.sessionStorage.setItem(isolationKey, 'true');
\t\t\t}
\t\t},
\t\t{
\t\t\tlanguageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
\t\t\tscenarioKey: BROWSER_SCENARIO_STORAGE_KEY
\t\t}
\t);
});
"""
if insert_after not in retail:
    raise RuntimeError("retail-sim.e2e.ts: beforeEach insertion point not found")
helper = """
async function advanceSimulationDay(page: Page): Promise<void> {
\tconst day = page.getByText(/^Day \\d+$/);
\tconst label = (await day.textContent()) ?? '';
\tconst currentDay = Number(label.match(/\\d+/)?.[0] ?? 0);
\tconst resume = page.getByRole('button', { name: /^resume$/i });
\tif (await resume.isVisible().catch(() => false)) {
\t\tawait resume.click();
\t}
\tawait page.getByRole('button', { name: /^5×$/i }).click();
\tawait expect(day).toHaveText(`Day ${currentDay + 1}`, { timeout: 2_500 });
\tawait page.getByRole('button', { name: /^pause$/i }).click();
}
"""
retail = retail.replace(insert_after, insert_after + helper, 1)
pattern = re.compile(r"await page\.getByRole\('button', \{ name: /\^?advance day\$?/i \}\)\.click\(\);")
retail, replaced = pattern.subn("await advanceSimulationDay(page);", retail)
if replaced == 0:
    raise RuntimeError("retail-sim.e2e.ts: no advance-day clicks replaced")
print(f"replaced {replaced} retail-sim manual advance clicks")
write(retail_path, retail)

print("time-flow implementation patches applied")
