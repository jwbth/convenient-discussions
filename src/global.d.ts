/// <reference types="types-mediawiki" />

import { Document as DomHandlerDocument, Node as DomHandlerNode, Element as DomHandlerElement } from 'domhandler';
import { ConvenientDiscussions, ConvenientDiscussionsWorker } from './cd';

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

  interface Window {
    // Basically we don't have a situation where getSelection() can return `null`, judging by
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection.
    getSelection(): Selection;

    cdOnlyRunByFooterLink?: boolean;
    cdShowLoadingOverlay?: boolean;
  }

  interface WindowOrWorkerGlobalScope {
    convenientDiscussions: ConvenientDiscussions | ConvenientDiscussionsWorker;
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

    wikiEditor(funcName: 'addModule' | 'addToToolbar' | 'removeFromToolbar' | 'addDialog' | 'openDialog' | 'closeDialog', data: any): this;
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
    cdMarginTop: number;
    cdMarginBottom: number;
    cdMarginLeft: number;
    cdMarginRight: number;
    cdCallback?: Function;

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

  namespace mw {
    const thanks: {
      thanked: number[];
    };

    namespace libs {
      namespace confirmEdit {
        class CaptchaInputWidget extends OO.ui.TextInputWidget {
          new (config?: captchaData);
        }
      }
    }

    namespace widgets {
      function visibleCodePointLimit(textInputWidget: OO.ui.TextInputWidget, limit?: number, filterFunction?: Function): void;

      interface TitleInputWidget
        extends OO.ui.TitleInputWidget,
          mw.widgets.TitleWidget,
          OO.ui.mixin.LookupElement {
        new (config: OO.ui.TitleInputWidget);
      }
    }
  }

  namespace OO.ui.Window {
    interface Props {
      $body: JQuery;
    }
  }

  namespace OO.ui.Dialog {
    interface Props {
      actions: ActionSet;
    }
  }

  namespace OO.ui.ProcessDialog {
    interface Prototype {
      showErrors(errors: OO.ui.Error[] | OO.ui.Error): void;
    }

    interface Props {
      $errors: JQuery;
    }
  }
}

export {};
