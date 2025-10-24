/**
 * This file has types for the code shared between the main and worker parts of the script.
 */

import BrowserComment from '../Comment';
import Section from '../Section';

import { HeadingTarget, SignatureTarget, Target } from './Parser';
import { ConvenientDiscussionsBase } from './cd';

declare global {
  type TypeByKey<T> = Record<string, T>;
  type StringsByKey = TypeByKey<string>;
  type NumbersByKey = TypeByKey<number>;
  type AnyByKey = TypeByKey<any>;
  type UnknownsByKey = TypeByKey<unknown>;
  type StringArraysByKey = TypeByKey<string[]>;
  type AnyFunction = (...args: any) => any;
  type ValidKey = string | number | symbol;
  type ApiRejectResponse = Exclude<mw.Api.RejectArgTuple[1], mw.Rest.HttpErrorData>;

  interface Message {
    task: string;
    [key: string]: any;
  }

  interface MessageFromWorker extends Message {
    resolverId: number;
  }

  interface MessageFromWorkerParse extends Message {
    task: 'parse';
    revisionId: number;
    resolverId: number;
    comments: CommentWorker[];
    sections: SectionWorker[];
  }

  interface MessageFromWindowParse extends Message {
    task: 'parse';
    revisionId: number;
    text: string;
    g: ConvenientDiscussionsBase['g'];
    config: ConvenientDiscussionsBase['config'];
  }

  interface MessageFromWindowSetAlarm extends Message {
    task: 'setAlarm';
    interval: number;
  }

  interface MessageFromWindowRemoveAlarm extends Message {
    task: 'removeAlarm';
  }

  type MessageFromWindow = MessageFromWindowParse | MessageFromWindowSetAlarm | MessageFromWindowRemoveAlarm;

  interface WindowOrWorkerGlobalScope {
    convenientDiscussions: ConvenientDiscussionsBase;
    cd?: WindowOrWorkerGlobalScope['convenientDiscussions'];
    Node: {
      ELEMENT_NODE: number;
      TEXT_NODE: number;
      COMMENT_NODE: number;
    };
  }

  var convenientDiscussions: WindowOrWorkerGlobalScope['convenientDiscussions'];

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
    substr(from: number, length?: number): string;
  }

  interface JQuery {
    cdRemoveNonElementNodes(): JQuery;
    cdScrollTo(
      alignment: 'top' | 'center' | 'bottom' = 'top',
      smooth = true,
      callback?: () => void,
    ): this;
    cdIsInViewport(partially = false): boolean;
    cdScrollIntoView(alignment: 'top' | 'center' | 'bottom' = 'top', smooth = true, callback?: () => void): this;
    cdGetText(): string;
    cdAddCloseButton(): this;
    cdRemoveCloseButton(): this;

    wikiEditor(functionName: 'addModule' | 'addToToolbar' | 'removeFromToolbar' | 'addDialog' | 'openDialog' | 'closeDialog', data: any): this;
  }

  interface Element {
    cdIsInline?: boolean;

    // Hack: Exclude `null`
    textContent: string;
  }

  interface Text {
    // Hack: Exclude `null`
    textContent: string;
  }

  interface Comment {
    // Hack: Exclude `null`
    textContent: string;
  }

  interface ChildNode {
    // Hack: Exclude `null`
    textContent: string;
  }

  type AnyNode = import('domhandler').Node | Node;
  type AnyElement = import('domhandler').Element | Element;
  type AnyText = import('domhandler').Text | Text;

  type NodeLike = AnyNode;
  type ElementLike = AnyElement;
  type HTMLElementLike = import('domhandler').Element | HTMLElement;
  type TextLike = AnyText;

  type NodeFor<T extends AnyNode> = T extends import('domhandler').Node
    ? import('domhandler').Node
    : Node;
  type TextFor<T extends AnyNode> = T extends import('domhandler').Node
    ? import('domhandler').Text
    : Text;
  type ElementFor<T extends AnyNode> = T extends import('domhandler').Node
    ? import('domhandler').Element
    : Element;
  type HTMLElementFor<T extends AnyNode> = T extends import('domhandler').Node
    ? import('domhandler').Element
    : HTMLElement;
  type DocumentFor<T extends AnyNode> = T extends import('domhandler').Node
    ? import('domhandler').Document
    : Document;

  interface ParsingContext<N extends AnyNode = AnyNode> {
    // Classes
    CommentClass: new (
      parser: Parser<N>,
      signature: SignatureTarget<N>,
      targets: Target<N>[]
    ) => N extends import('domhandler').Node
      ? CommentWorker
      : BrowserComment;
    SectionClass: new (
      parser: Parser<N>,
      heading: HeadingTarget<N>,
      targets: Target<N>[],
      subscriptions: Subscriptions
    ) => N extends import('domhandler').Node
      ? SectionWorker
      : Section;

    // Properties
    childElementsProp: string;
    rootElement: ElementFor<N>;
    document: DocumentFor<N>;

    // Non-DOM methods
    areThereOutdents: () => boolean;
    processAndRemoveDtElements: (elements: ElementFor<N>[]) => void;
    removeDtButtonHtmlComments: () => void;

    // DOM methods

    // Note: NodeFor<N> instead of N here solves a bulk of type errors due to contravarience in all
    // places Parser<AnyNode>, CommentSkeleton<AnyNode> or SectionSkeleton<AnyNode> is expected and
    // Parser<Node> or CommentSkeleton<Node> or SectionSkeleton<Node> is used.
    follows: (element1: NodeFor<N>, element2: NodeFor<N>) => boolean;
    getAllTextNodes: () => TextFor<N>[];
    getElementByClassName: (element: ElementFor<N>, className: string) => ElementFor<N> | null;
  }
}
