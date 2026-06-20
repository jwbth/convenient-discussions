interface CommentAction {
	element?: HTMLElement
	editButton?: { element?: HTMLElement }
	replyButton?: { element?: HTMLElement }
	toggleChildThreadsButton?: { element?: HTMLElement }
}

interface Comment {
	index: number
	id?: string
	level?: number
	thread?: unknown
	elements?: HTMLElement[]
	actions?: CommentAction
	getText?: () => string
	getChildren: () => Comment[]
	getParent?: () => Comment | undefined
}

interface ConvenientDiscussions {
	isRunning?: boolean
	comments: Comment[]
	commentForms?: any[]
	sections?: any[]
	settings?: any
	g?: any
	config?: any
	i18n?: any
	s?: (name: string) => string
}

interface TestConsoleMessage {
	type: string
	text: string
}

declare global {
	interface Window {
		mw: any
		$: any
		convenientDiscussions: ConvenientDiscussions
		cdLocalCommentDisplay?: string
		_testConsoleMessages?: TestConsoleMessage[]
	}

	interface Element {
		_cdComment?: Comment
	}
}

export {}
