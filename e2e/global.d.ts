declare global {
	interface Window {
		mw: any
		$: any
		convenientDiscussions: {
			isRunning?: boolean
			comments?: any[]
			sections?: any[]
			settings?: any
			g?: {
				CURRENT_PAGE?: {
					name?: string
				}
			}
		}
		_testConsoleMessages?: { type: string; text: string }[]
	}
}

export {}
