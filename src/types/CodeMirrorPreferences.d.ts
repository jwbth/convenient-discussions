import type { Extension, StateEffectType, StateField } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export interface CodeMirrorExtensionRegistry {
	names: string[]
	register(name: string, extension: Extension, view: EditorView, enabled?: boolean): void
	toggle(name: string, view: EditorView, enabled: boolean): void
	get(name: string): Extension
	getCompartment(name: string): any
	isRegistered(name: string, view: EditorView): boolean
}

export interface CodeMirrorPanel {
	dom: HTMLElement
	top: boolean
}

declare class CodeMirrorPreferences {
	constructor(
		extensionRegistry: CodeMirrorExtensionRegistry,
		mode: string,
		isVisualEditor?: boolean,
	)
	optionName: string

	extensionRegistry: CodeMirrorExtensionRegistry

	mode: string

	isVisualEditor: boolean

	api: any // Cannot easily resolve mw.Api without bringing in large dependencies or global assumptions

	prefsToggleEffect: StateEffectType<boolean>

	panelStateField: StateField<boolean>

	preferences: Record<string, boolean>

	primaryPreferences: string[]

	dialogConfig: Record<string, string[]>

	readonly mwConfigDefaults: Record<string, boolean | string[] | number[]>

	readonly mwConfigPrimary: Record<string, boolean | string[] | number[]>

	getDefaultPreferences(): Record<string, boolean>
	fetchPreferences(): Record<string, boolean>
	setPreference(key: string, value: boolean): void
	getPreference(prefName: string): boolean
	hasNonDefaultPreferences(): boolean
	registerExtension(name: string, extension: Extension, view: EditorView): void
	toggleExtension(name: string, view: EditorView): void
	readonly extension: Extension[]

	readonly panel: CodeMirrorPanel
	toggle(view: EditorView, force?: boolean): boolean
	onKeydownPanel(event: KeyboardEvent): void
	showPreferencesDialog(view: EditorView): boolean
	getCheckbox(name: string, label: string, checked: boolean): [HTMLElement, HTMLInputElement]
}

export default CodeMirrorPreferences
