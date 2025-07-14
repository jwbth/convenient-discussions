# General rules
* When defining, redefining, or moving a class, always include all relevant methods. Avoid using placeholders like `// ... existing code ...` that might imply missing methods. Ensure the class definition is complete and accurate each time.
* Don't modify code I didn't ask you to modify unless necessary to perform the task at hand. When in doubt, request me to provide answers, code, or documentation necessary for an adequate response.
* Don't mess with code style.
* Make sure to keep the original comments (including JSDoc comments and type hints like `/** @type {<type>} */`) to the code unless the relevant code is removed or I explicitly asked for the comments to be changed or removed. Don't remove JSDoc comments with `@overload` tag.
* Avoid using one-time variables, unless they are used in template literals. E.g., instead of writing
  ```js
  const htmlToCompare = this.getElementHtmlToCompare(element);
  this.updateCompareProperties(element, htmlToCompare);
  ```
  write this:
  ```js
  this.updateCompareProperties(element, this.getElementHtmlToCompare(element));
  ```

# JavaScript code style
* Refrain from introducing new `null` values. Don't assign any values to declared variables that don't have a value yet so that they stay `undefined`.
* Introduce class properties using class field syntax rather than inside the constructor.
* Use trailing commas in objects and arraays.
* Add an empty line before `return` at the end of a block unless it's the only statement in that block.
* Use 2 spaces for indentation.

# JSDoc code style
* Don't put "-" between the property name and its description.
* Use `Type[]`, not `Array<Type>`.
* Use `object` as the type name, not `Object`.
* Prefer the index signature syntax (e.g. `{ [key: string]: any }`) to `Record` type (e.g. `Record<string, any>`).
* Add an empty line before the first JSDoc tag when it follows a description, e.g.:
  ```js
  /**
  * Get the archive prefix for the page.
  *
  * @param {boolean} [onlyExplicit=false]
  * @returns {string|undefined}
  */
  ```
