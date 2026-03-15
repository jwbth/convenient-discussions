declare global {
	interface Window {
		mw: any
		$: any
		convenientDiscussions: {
			isRunning?: boolean
			comments?: any[]
			commentForms?: any[]
			sections?: any[]
			settings?: any
			g?: any
		}
		_testConsoleMessages?: { type: string; text: string }[]
	}
}

export {}
