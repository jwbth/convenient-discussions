**Convenient Discussions** (**CD**) is a JavaScript tool that provides an enhanced user experience for MediaWiki talk pages. It acts as a shell over the existing MediaWiki discussion system.

- Don't run `npm run dev` (assume already running).
- Cover non-trivial behaviors and fixes with unit tests, or e2e tests where unit tests can't reach.
- Test CD in the browser through the Chrome DevTools MCP: its Chrome is logged in to a test account and keeps tabs visible, which CD needs to boot. Unless the task calls for another page, use https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page. Load the dev build with:

  ```js
  const script = document.createElement('script')
  script.type = 'module'
  script.src = 'http://localhost:9000/src/loader/startup.js'
  document.head.appendChild(script)
  ```

## Coding conventions

### JavaScript & TypeScript

- Functions should be ordered in a top-down fashion (high-level first).
- Types, however, should be ordered in a bottom-up (low-level first) fashion.
- Avoid introducing variables used only once. Exceptions:
  - Variables used in template strings. Prefer them to having function calls inside template strings.
  - Cases where the use of the variable is in a loop or function while the assignment is not.

- When using a method in a callback, don't bind it using `.bind()`. Instead, turn it into an arrow function:

  ```js
  someMethod() {
    document.addEventListener('click', this.onClick);
  }

  onClick = () => {
    // ...
  };
  ```

- Use functional patterns where possible.
- Don't introduce new `null` values or return `null` in newly created functions. Use `undefined` instead, but omit assigning or returning it where the value is `undefined` anyway.
- When a function parameter is not used in the function, put an underscore in front of it.
- If ESLint reports wrong import order, unused imports, or wrong indentation, don't fix it. Hooks apply ESLint's automatic fixes to every file you write and everything that reaches the index.

### JSDoc

- Don't fix type errors by changing types to `any`.
- Don't use the `object` type when you know a more precise type is known. If that type is not defined, define it with `@typedef` and use it.
- Don't use tags that are already reflected in the syntax (e.g. `@static`).
- When a class method is overriding a method of the parent class, add `@override` tag to its JSDoc comment.
- Don't start every comment sentence on a new line. Use periods. If it is necessary to separate different groups of information, use paragraphs.
