---
inclusion: always
---

# Instructions

## About the project

This is a JavaScript project with type checking supplied by TypeScript through types defined in JSDoc. However, it also has some type definitions in .d.ts files.

## General rules

- When testing with `npm test`, use space, not `=`, between the option name and the value, e.g. `npm test -- --testNamePattern "TagsAutocomplete"`, not `npm test -- --testNamePattern="TagsAutocomplete"`.
- Don't modify code I didn't ask you to modify unless strictly necessary to perform the task at hand. When in doubt, request me to provide answers, code, or documentation necessary for an adequate response.
- Don't mess with code style of existing code.
- Make sure to keep the original comments (including JSDoc comments and type hints like `/** @type {<type>} */`) to the code unless the relevant code is removed or I explicitly asked for the comments to be changed or removed. Don't remove JSDoc comments with `@overload` tag.
- Avoid using one-time variables, unless they are used in template literals. E.g., instead of writing

  ```js
  const htmlToCompare = this.getElementHtmlToCompare(element);
  this.updateCompareProperties(element, htmlToCompare);
  ```

  write this:

  ```js
  this.updateCompareProperties(element, this.getElementHtmlToCompare(element));
  ```

- Files should end with a single newline. This includes `.md` files.

## JavaScript & TypeScript code style

- One class per file.
- Don't introduce one-time variables. A variable should either be used at least twice or not exist. Exceptions:
  - Variables used in template strings. Those are OK to be used only once.
  - Cases where the use of the variable is in a loop or function while the assignment is not.
  - Cases where the assignment and the use of the variable are separated by a function with a side effect affecting that variable.
- When using a method in a callback, don't bind it using `.bind()`. Instead, turn it into an arrow function. E.g. don't do this:

  ```js
  someMethod() {
    this.boundOnClick = this.onClick.bind(this);
    document.addEventListener('click', this.boundOnClick);
  }

  onClick() {
    // ...
  }
  ```

  Instead, do this:

  ```js
  someMethod() {
    document.addEventListener('click', this.onClick);
  }

  onClick = () => {
    // ...
  };
  ```

  When the class is a mixin (those have `Mixin` in their names), declare `onClick` inside the method itself, not via the class field initialization mechanism.

- Don't introduce new `null` values. Use `undefined` instead, but don't assign any values to variables that don't have a value yet so that they stay `undefined`. Avoid returning `null` from functions instead of `undefined`.
- Introduce class properties using class field syntax rather than inside the constructor.
- Use optional chaining (`?.`) and nullish coalescing (`??`) operators, as well as logical OR assignment (`||=`) and other assignment operators.
- Use trailing commas in objects and arrays.
- Add an empty line before `return` statements at the end of blocks (function, `if` statement, etc.) unless it's the only statement in that block.
- Use 2 spaces for indentation.
- Use single quotes for strings.
- Code comments should have one empty line before them.
- Maximum line length is 100.
- When adding inline comments, place 2 spaces before them: `expression;  // Comment`.
- Put a space between inline JSDoc comments and the following expression: `/** @type {string} */ (variable)`, not `/** @type {string} */(variable)`.
- When a function parameter is not used in the function, put an underscore in front of it.
- When a class method is overriding a method of the parent class, add `@override` tag to its  JSDoc comment.

## JSDoc code style

- Refrain from fixing type errors by changing types to `any`. Better leave the problem unresolved than resort to `any`.
- Don't use `Function` as a type. Indicate the function signature or use `AnyFunction` to indicate a generic function (`(...args: any) => any`).
- Don't use the `object` type when you know a more precise type is known. If that type is now defined, define it with `@typedef` and use it.
- Don't use the `@static` tag.
- Instead of defining JSDoc types in each file independently, aim to reuse types by importing them with `import('path').Type` from one file deemed the most appropriate to hold it.
- Don't put "-" between the property name and its description.
- Use `Type[]`, not `Array<Type>`.
- Prefer the index signature syntax (e.g. `{ [key: string]: any }`) to `Record` type (e.g. `Record<string, any>`).
- Add an empty line before the first JSDoc tag when it follows a description, e.g.:

  ```js
  /**
   * Get the archive prefix for the page.
   *
   * @param {boolean} [onlyExplicit=false]
   * @returns {string | undefined}
   */
  ```

- Use spaces around logical operators, e.g. write `@type {RadioSelectControl | TextInputControl}`, not `@type {RadioSelectControl|TextInputControl}`.
