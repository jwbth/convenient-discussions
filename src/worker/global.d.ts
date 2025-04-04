import { Document, Element, Node } from 'domhandler';

declare global {
  interface WorkerGlobalScope {
    Document: typeof Document;
    Node: typeof Node;
    document?: Document;
  }

  const Node: WorkerGlobalScope['Node'];
  const document: NonNullable<WorkerGlobalScope['document']>;
}

export {};
