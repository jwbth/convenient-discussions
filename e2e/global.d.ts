interface Comment {
	index: number
	getText?: () => string
	getChildren: () => Comment[]
}

interface TestConsoleMessage {
	type: string
	text: string
}

declare global {
	interface Window {
		mw: any
		$: any
		convenientDiscussions: {
			isRunning?: boolean
			comments?: Comment[]
			commentForms?: any[]
			sections?: any[]
			settings?: any
			g?: any
		}
		_testConsoleMessages?: TestConsoleMessage[]
	}
}

export {}
