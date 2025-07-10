import 'domhandler';

declare module 'domhandler' {
  namespace Node {
    export readonly var ELEMENT_NODE: 1;
    export readonly var TEXT_NODE: 3;
    export readonly var COMMENT_NODE: 8;
  }

  interface Node {
    /**
     * Insert the current node immediately after the given reference node.
     */
    after(referenceNode: Node): void;

    /**
     * Insert the current node immediately before the given reference node.
     */
    before(referenceNode: Node): void;

    /**
     * Remove the node from the document.
     */
    remove: () => void;

    /**
     * Check whether the element follows a node in the document (like
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/Node/compareDocumentPosition}
     * checks).
     */
    follows(node: Node): boolean;

    /**
     * The content of the text node, with HTML entities decoded.
     */
    textContent: string;

    /**
     * The parent element of the node.
     */
    parentElement: Element | null;
  }

  interface NodeWithChildren {
    /**
     * Check if the element contains the specified node, either directly or indirectly as a
     * descendant, or is the same node.
     */
    contains(node: Node): boolean;

    /**
     * Recursively traverse the subtree and filter the nodes according to the provided callback
     * function.
     */
    filterRecursively(func: (node: Node) => boolean, limit?: number): Node[];

    /**
     * Iterate over child nodes, testing the node using the provided callback.
     *
     * Returns `true` to stop walking through subtree (after founding the required amounts for
     * elements, for instance).
     */
    traverseSubtree: (callback: (node: Node) => boolean, checkSelf?: boolean) => boolean;
  }

  interface Document {
    /**
     * Creates a new element with the given tag name.
     */
    createElement(name: string): Element;

    /**
     * Creates a new text node with the given content.
     */
    createTextNode(content: string): Text;

    getElementsByClassName(name: string, limit?: number): Element[];
    querySelectorAll(selector: string): Element[];
  }

  interface Element {
    /**
     * Append a node to the element's child nodes.
     */
    appendChild(node: Node): void;

    /**
     * Remove the node from the element's child nodes if it is there.
     */
    removeChild(node: Node): void;

    /**
     * Insert a node before a given reference node in the element's child nodes.
     *
     * If the reference node is null, the node is appended to the element's child nodes.
     */
    insertBefore(node: Node, referenceNode?: Node): Node;

    /**
     * Check if the element has an attribute with the given name.
     */
    hasAttribute(name: string): boolean;

    /**
     * Get the value of the attribute with the specified name on the element. If the attribute value
     * contains special characters `&` or `"`, they are replaced with their corresponding special
     * characters `&` and `"`, respectively.
     */
    getAttribute(name: string): string | null;

    /**
     * Set the value of the attribute with the specified name on the element. If the value contains
     * special characters `&` or `"`, they are replaced with their corresponding HTML entities
     * `&amp;` and `&quot;`, respectively.
     */
    setAttribute(name: string, value: string): void;

    /**
     * Remove the attribute with the specified name from the element.
     */
    removeAttribute(name: string): void;

    getElementsByClassName(name: string, limit?: number): Element[];

    /**
     * Return all elements that have any attribute whose name matches the given regular expression.
     */
    getElementsByAttribute(regexp: RegExp): Element[];

    /**
     * Return all descendants that match the given CSS selector.
     *
     * Supports only classes and tags as selectors.
     */
    querySelectorAll(selector: string): Element[];

    getElementsByTagName(name: string): Element[];

    childElements: Element[];
    previousElementSibling: Element;
    nextElementSibling: Element;
    firstElementChild: Element;
    lastElementChild: Element;
    textContent: string;
    innerHTML: string;
    outerHTML: string;

    /**
     * The tag name of the element in upper case. This overrides the native method.
     */
    tagName: string;

    classList: TokenList;
    className: string;

    private _classList: TokenList;

    cdIsInline?: boolean;
  }

  interface TokenList extends Array<string> {
    contains(name: string): boolean;
    add(...names: string[]): void;
    remove(...names: string[]): void;

    private moveFromClassAttr(classAttr?: string): void;
    private movedFromClassAttr: boolean;
  }
}

export {};
