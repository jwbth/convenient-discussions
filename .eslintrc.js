module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true,
  },
  "extends": "eslint:recommended",
  "globals": {
    "IS_SNIPPET": "readonly",
    "CONFIG_FILE_NAME": "readonly",
    "LANG_FILE_NAME": "readonly",
    "IS_DEV": "readonly",
    "$": "readonly",
    "OO": "readonly",
    "Tribute": "readonly",
    "convenientDiscussions": "readonly",
    "jQuery": "readonly",
    "mw": "readonly",
    "require": "readonly",
  },
  "ignorePatterns": ["dist/**", "misc/**", "*.json5"],
  "overrides": [
    {
      "files": ["./*.js"],
      "rules": {
        "jsdoc/require-jsdoc": "off"
      }
    }
  ],
  "parser": "babel-eslint",
  "parserOptions": {
    "ecmaVersion": 2018,
    "sourceType": "module",
  },
  "plugins": [
    "sort-imports-es6-autofix",
    "jsdoc",
  ],
  "rules": {
    "jsdoc/check-alignment": "warn",
    "jsdoc/check-param-names": "warn",
    "jsdoc/check-tag-names": "warn",
    "jsdoc/check-types": "warn",
    "jsdoc/implements-on-classes": "warn",
    "jsdoc/newline-after-description": "warn",
    "jsdoc/no-undefined-types": "warn",
    "jsdoc/require-jsdoc": "warn",
    "jsdoc/require-param": "warn",
    // "jsdoc/require-param-description": "warn",
    "jsdoc/require-param-name": "warn",
    "jsdoc/require-param-type": "warn",
    "jsdoc/require-returns": "warn",
    "jsdoc/require-returns-check": "warn",
    // "jsdoc/require-returns-description": "warn",
    "jsdoc/require-returns-type": "warn",
    "jsdoc/valid-types": "warn",
    "no-constant-condition": ["error", { "checkLoops": false }],
    "no-control-regex": "off",
    "no-unused-vars": ["error", { "args": "after-used" }],
    "require-atomic-updates": "off",
    "sort-imports-es6-autofix/sort-imports-es6": ["warn", {
      "ignoreCase": false,
      "ignoreMemberSort": false,
      "memberSyntaxSortOrder": ["none", "all", "single", "multiple"],
    }],
  },
  "settings": {
    "jsdoc": {
      "preferredTypes": [
        "Comment",
        "CommentSkeleton",
        "CommentForm",
        "Element",
        "JQuery",
        "Node",
        "Page",
        "Parser",
        "Section",
        "User",
      ],
    },
  },
};
