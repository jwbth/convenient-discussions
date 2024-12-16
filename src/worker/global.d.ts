import { Document as DocumentClass } from 'domhandler';

declare global {
  interface WorkerGlobalScope {
    Document: typeof DocumentClass;
    Node: {
      ELEMENT_NODE: 1;
      TEXT_NODE: 3;
      COMMENT_NODE: 8;
    };
    document: Document | undefined;
  }

  const Document: WorkerGlobalScope['Document'];
  const Node: WorkerGlobalScope['Node'];
  const document: WorkerGlobalScope['document'];
}

export {};
