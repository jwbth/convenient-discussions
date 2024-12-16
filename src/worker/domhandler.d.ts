import 'domhandler';
import { Node as NodeClass } from 'domhandler';

declare module 'domhandler' {
  interface Node {
    follows: (node: NodeClass) => boolean;
    remove: () => void;
  }

  interface NodeWithChildren {
    traverseSubtree: (callback: (node: NodeClass) => boolean, checkSelf?: boolean) => boolean;
  }

  interface Document {
    createElement(name: string): NodeClass;
    createTextNode(content: string): NodeClass;
    getElementsByClassName(name: string, limit?: number): NodeClass[];
    querySelectorAll(selector: string): NodeClass[];
  }

  interface Element {
    hasAttribute(name: string): boolean;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
    appendChild(node: NodeClass): void;
    insertBefore(node: NodeClass, referenceNode: NodeClass): void;
    removeChild(node: NodeClass): void;
    contains(node: NodeClass): boolean;
    filterRecursively(func: (node: NodeClass) => boolean, limit?: number): NodeClass[];
    getElementsByClassName(name: string, limit?: number): NodeClass[];
    getElementsByAttribute(regexp: RegExp): NodeClass[];
    querySelectorAll(selector: string): NodeClass[];
    getElementsByTagName(name: string): NodeClass[];

    classList: TokenList;
  }

  interface TokenList {
    contains(name: string): boolean;
    add(...names: string[]): void;
    remove(...names: string[]): void;
  }
}
