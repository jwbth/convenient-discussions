import { Document } from 'domhandler';

declare global {
  const IS_TEST: boolean;
  const IS_DEV: boolean;
  const IS_SINGLE: boolean;
  const CONFIG_FILE_NAME: string | null;
  const LANG_CODE: string | null;

  interface DedicatedWorkerGlobalScope {
    Document: typeof Document;
    Node: {
      ELEMENT_NODE: number;
      TEXT_NODE: number;
      COMMENT_NODE: number;
    };
  }
}

export {};
