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
    cdScrollTo(
      alignment: 'top' | 'center' | 'bottom' = 'top',
      smooth = true,
      callback?: () => void,
    ): this;
    cdIsInViewport(partially = false): boolean;
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
    cdInput?: OO.ui.TextInputWidget;
    cdIsInline?: boolean;

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
          getCaptchaId(): string;
          getCaptchaWord(): string;
        }
      }
    }

    namespace widgets {
      function visibleCodePointLimit(textInputWidget: OO.ui.TextInputWidget, limit?: number, filterFunction?: Function): void;

      // interface TitleInputWidget
      //   extends OO.ui.TitleInputWidget,
      //     mw.widgets.TitleWidget,
      //     OO.ui.mixin.LookupElement {
      //   new (config: OO.ui.TitleInputWidget);
      // }
    }

    // namespace Upload {
    //   interface DialogConfig {
    //     bookletClass?: typeof mw.Upload.BookletLayout;
    //     booklet?: object;
    //   }

    //   class Dialog extends OO.ui.ProcessDialog {
    //     static name: string;
    //     static title: string | Function;
    //     static actions: Array<{
    //       flags: string | string[];
    //       action: string;
    //       label: string;
    //       modes: string | string[];
    //     }>;

    //     constructor(config?: DialogConfig);

    //     protected createUploadBooklet(): mw.Upload.BookletLayout;
    //     protected onUploadBookletSet(page: OO.ui.PageLayout): void;
    //     protected onUploadValid(isValid: boolean): void;
    //     protected onInfoValid(isValid: boolean): void;

    //     protected bookletClass: typeof mw.Upload.BookletLayout;
    //     protected bookletConfig: object;
    //     protected uploadBooklet: mw.Upload.BookletLayout;
    //   }
    // }
  }

  namespace OO.ui {
    namespace Window {
      interface Props {
        $body: JQuery;
      }
    }

    namespace Dialog {
      interface Props {
        actions: ActionSet;
      }
    }

    namespace ProcessDialog {
      interface Prototype {
        showErrors(errors: OO.ui.Error[] | OO.ui.Error): void;
        hideErrors(): void;
      }

      interface Props {
        $errors: JQuery;
        $errorItems: JQuery;
      }
    }

    namespace MessageDialog {
      interface Props {
        text: PanelLayout;
        title: OO.ui.LabelWidget;
      }
    }

    interface Process {
      next<C = null>(step: Process.StepOverride<C>, context?: C): this;
    }

    // Add native Promise since it seems to work and we use it
    namespace Process {
      type StepOverride<C> =
        | number
        | JQuery.Promise<void>
        | Promise<void>
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        | ((this: C) => boolean | number | JQuery.Promise<void> | Promise<void> | Error | [Error] | void);

      interface Constructor {
        /**
         * @param step Number of milliseconds to wait before proceeding,
         * promise that must be resolved before proceeding, or a function to execute.
         * See {@link Process.first first} for more information.
         * @param context Execution context of the function. The context is ignored if the step
         * is a number or promise.
         */
        new<C = null>(step?: StepOverride<C>, context?: C): Process;
      }
    }

    namespace PageLayout {
      interface Props {
        outlineItem: OutlineOptionWidget | null;
      }

      interface Prototype {
        setupOutlineItem(): void;
      }
    }

    namespace RadioOptionWidget {
      interface Props {
        radio: OO.ui.RadioInputWidget;
      }
    }

    namespace RadioSelectWidget {
      interface Prototype {
        findSelectedItem(): OptionWidget | null;
      }
    }
  }

  interface JQueryStatic {
    _data(element: Element, key: string): any;
    wikiEditor: any;
  }
}

export {};
