import { Document } from 'domhandler';
import { ConvenientDiscussions } from './cd';

declare global {
  const IS_TEST: boolean;
  const IS_DEV: boolean;
  const IS_SINGLE: boolean;
  const CONFIG_FILE_NAME: string | null;
  const LANG_CODE: string | null;

  const convenientDiscussions: Window['convenientDiscussions'];
  const cd: Window['cd'] | undefined;

  interface WindowOrWorkerGlobalScope {
    convenientDiscussions: ConvenientDiscussions;
    cd?: Window['convenientDiscussions'];
  }

  interface DedicatedWorkerGlobalScope {
    Document: typeof Document;
    Node: {
      ELEMENT_NODE: number;
      TEXT_NODE: number;
      COMMENT_NODE: number;
    };
  }

  interface JQuery {
    cdRemoveNonElementNodes(): void;
    cdScrollTo(alignment = 'top', smooth = true, callback): this;
    cdIsInViewport(partially = false): boolean;
    cdScrollIntoView(alignment = 'top', smooth = true, callback): this;
    cdGetText(): string;
    cdAddCloseButton(): this;
    cdRemoveCloseButton(): this;
  }
}

export {};
