/**
 * This file has types for the code shared between the main and worker parts of the script.
 */

import type {
	Document as DomHandlerDocument,
	Element as DomHandlerElement,
	Node as DomHandlerNode,
	Text as DomHandlerText,
} from 'domhandler'

import type CommentCd from '../Comment'
import type Section from '../Section'
import type { CommentManager } from '../commentManager'

import type { HeadingTarget, SignatureTarget, Target } from './Parser'
import type { ConvenientDiscussionsBase } from './cd'

declare global {
	type TypeByStringKey<T> = Record<string, T>
	type StringsByKey = TypeByStringKey<string>
	type NumbersByKey = TypeByStringKey<number>
	type AnyByKey = TypeByStringKey<any>
	type UnknownsByKey = TypeByStringKey<unknown>
	type StringArraysByKey = TypeByStringKey<string[]>
	type AnyFunction = (...args: any) => any
	type ValidKey = string | number | symbol
	type ApiRejectResponse = Exclude<mw.Api.RejectArgTuple[1], mw.Rest.HttpErrorData>
	type LanguageTarget = 'content' | 'user'

	interface Message {
		task: string
		[key: string]: any
	}

	interface MessageFromWorker extends Message {
		resolverId: number
	}

	interface MessageFromWorkerParse extends Message {
		task: 'parse'
		revisionId: number
		resolverId: number
		comments: CommentWorker[]
		sections: SectionWorker[]
	}

	interface MessageFromWindowParse extends Message {
		task: 'parse'
		revisionId: number
		text: string
		g: ConvenientDiscussionsBase['g']
		config: ConvenientDiscussionsBase['config']
	}

	interface MessageFromWindowSetAlarm extends Message {
		task: 'setAlarm'
		interval: number
	}

	interface MessageFromWindowRemoveAlarm extends Message {
		task: 'removeAlarm'
	}

	type MessageFromWindow =
		| MessageFromWindowParse
		| MessageFromWindowSetAlarm
		| MessageFromWindowRemoveAlarm

	interface WindowOrWorkerGlobalScope {
		convenientDiscussions: ConvenientDiscussionsBase
		cd?: WindowOrWorkerGlobalScope['convenientDiscussions']
		Node: {
			ELEMENT_NODE: number
			TEXT_NODE: number
			COMMENT_NODE: number
		}
	}

	var convenientDiscussions: WindowOrWorkerGlobalScope['convenientDiscussions']

	// https://stackoverflow.com/a/71104272
	interface String {
		/**
		 * Gets a substring beginning at the specified location and having the specified length.
		 * (Deprecation removed.)
		 *
		 * @param from The starting position of the desired substring. The index of the first character
		 *   in the string is zero.
		 * @param length The number of characters to include in the returned substring.
		 */
		substr(from: number, length?: number): string
	}

	interface Element {
		cdIsInline?: boolean

		// Hack: Exclude `null`
		textContent: string
	}

	interface Text {
		// Hack: Exclude `null`
		textContent: string
	}

	interface Comment {
		// Hack: Exclude `null`
		textContent: string
	}

	interface ChildNode {
		// Hack: Exclude `null`
		textContent: string
	}

	type AnyNode = DomHandlerNode | Node
	type AnyElement = DomHandlerElement | Element
	type AnyText = DomHandlerText | Text

	type NodeLike = AnyNode
	type ElementLike = AnyElement
	type HTMLElementLike = DomHandlerElement | HTMLElement
	type TextLike = AnyText

	type NodeFor<T extends AnyNode> = T extends DomHandlerNode ? DomHandlerNode : Node
	type TextFor<T extends AnyNode> = T extends DomHandlerNode ? DomHandlerText : Text
	type ElementFor<T extends AnyNode> = T extends DomHandlerNode ? DomHandlerElement : Element
	type HTMLElementFor<T extends AnyNode> = T extends DomHandlerNode
		? DomHandlerElement
		: HTMLElement
	type DocumentFor<T extends AnyNode> = T extends DomHandlerNode ? DomHandlerDocument : Document

	interface ParsingContext<N extends AnyNode = AnyNode> {
		// Classes
		CommentClass: new (
			parser: Parser<N>,
			signature: SignatureTarget<N>,
			targets: Target<N>[],
			commentManager: N extends DomHandlerNode ? undefined : CommentManager,
		) => N extends DomHandlerNode ? CommentWorker : CommentCd
		SectionClass: new (
			parser: Parser<N>,
			heading: HeadingTarget<N>,
			targets: Target<N>[],
			sectionManager: N extends DomHandlerNode ? undefined : SectionManager,
			subscriptions: Subscriptions,
		) => N extends DomHandlerNode ? SectionWorker : Section

		// Properties
		childElementsProp: string
		rootElement: ElementFor<N>
		document: DocumentFor<N>

		// Non-DOM methods
		areThereOutdents: () => boolean
		processAndRemoveDtElements: (elements: ElementFor<N>[]) => void
		removeDtButtonHtmlComments: () => void

		// DOM methods

		// Note: NodeFor<N> instead of N here solves a bulk of type errors due to contravarience in all
		// places Parser<AnyNode>, CommentSkeleton<AnyNode> or SectionSkeleton<AnyNode> is expected and
		// Parser<Node> or CommentSkeleton<Node> or SectionSkeleton<Node> is used.
		follows: (element1: NodeFor<N>, element2: NodeFor<N>) => boolean
		getAllTextNodes: () => TextFor<N>[]
		getElementByClassName: (element: ElementFor<N>, className: string) => ElementFor<N> | null
	}
}
