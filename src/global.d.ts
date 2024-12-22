import { Document as DomHandlerDocument, Node as DomHandlerNode, Element as DomHandlerElement } from 'domhandler';
import { ConvenientDiscussions } from './cd';

declare global {
  const IS_TEST: boolean;
  const IS_DEV: boolean;
  const IS_SINGLE: boolean;
  const CONFIG_FILE_NAME: string | null;
  const LANG_CODE: string | null;
  const moment: Function;

  const getInterwikiPrefixForHostname: Function;
  const getInterwikiPrefixForHostnameSync: Function;
  const getUrlFromInterwikiLink: Function;

  const convenientDiscussions: Window['convenientDiscussions'];
  const cd: Window['cd'] | undefined;

  const cdOnlyRunByFooterLink: boolean | undefined;

  interface WindowOrWorkerGlobalScope {
    convenientDiscussions: ConvenientDiscussions;
    cd?: Window['convenientDiscussions'];
  }

  interface DedicatedWorkerGlobalScope {
    Document: typeof DomHandlerDocument;
    Element: typeof DomHandlerElement;
    Node: typeof DomHandlerNode;
    Node: {
      ELEMENT_NODE: number;
      TEXT_NODE: number;
      COMMENT_NODE: number;
    };
  }

  interface JQuery {
    cdRemoveNonElementNodes(): void;

    /**
     * Scroll to the element.
     *
     * @param {'top'|'center'|'bottom'} [alignment='top'] Where should the element be positioned
     *   relative to the viewport.
     * @param {boolean} [smooth=true] Whether to use a smooth animation.
     * @param {(() => void)} [callback] Callback to run after the animation has
     * completed.
     * @returns {this}
     * @memberof JQuery.fn
     */
    cdScrollTo(
      alignment: 'top' | 'center' | 'bottom' = 'top',
      smooth = true,
      callback?: () => void,
    ): this;

    cdIsInViewport(partially = false): boolean;

    /**
     * Scroll to the element if it is not in the viewport.
     *
     * @param {'top'|'center'|'bottom'} [alignment='tops'] Where should the element be positioned
     *   relative to the viewport.
     * @param {boolean} [smooth=true] Whether to use a smooth animation.
     * @param {() => void} [callback] Callback to run after the animation has completed.
     * @returns {this}
     */
    cdScrollIntoView(alignment: 'top'|'center'|'bottom' = 'top', smooth = true, callback?: () => void): this;

    cdGetText(): string;
    cdAddCloseButton(): this;
    cdRemoveCloseButton(): this;
  }

  interface Node {
    // Hack: remove generics to simplify making methods in window and worker scopes compatible
    //insertBefore(node: Node, child: Node | null): Node;
  }

  interface Element {
    cdStyle: CSSStyleDeclaration;
    cdIsTopLayersContainer: boolean;
    cdCachedLayersContainerTop: number;
    cdCachedLayersContainerLeft: number;
    cdCouldHaveMoved: boolean;

    // Exclude `null` which is not done in the native lib
    textContent: string;
  }

  interface Text {
    // Exclude `null` which is not done in the native lib
    textContent: string;
  }

  interface Comment {
    // Exclude `null` which is not done in the native lib
    textContent: string;
  }

  interface ChildNode {
    // Exclude `null` which is not done in the native lib
    textContent: string;
  }
}

export {};
