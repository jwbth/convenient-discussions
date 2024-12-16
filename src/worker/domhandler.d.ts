import 'domhandler';
import { Node as NodeConstructor } from 'domhandler';

declare module 'domhandler' {
  interface Element {
    hasAttribute: (name: string) => boolean;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
    appendChild: (node: NodeConstructor) => void;
    insertBefore: (node: NodeConstructor, referenceNode: NodeConstructor) => void;
    removeChild: (node: NodeConstructor) => void;
    contains: (node: NodeConstructor) => boolean;
  }

  interface Node {
    follows: (node: NodeConstructor) => boolean;
    remove: () => void;
  }
}
