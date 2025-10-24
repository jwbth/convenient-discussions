// import babelParser from '@babel/eslint-parser';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import esX from 'eslint-plugin-es-x';
import importPlugin from 'eslint-plugin-import';
import { jsdoc } from 'eslint-plugin-jsdoc';
import noOneTimeVars from 'eslint-plugin-no-one-time-vars';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const config = defineConfig(
  {
    ignores: ['dist/**', 'misc/**', '*.json5', 'config/**/*', '**/test.ts', '**/test.js', 'src/tribute/**'],
  },
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: './jsconfig.json',
        },
      },
    },
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  jsdoc({
    config: 'flat/recommended-typescript-flavor',
    rules: {
      'jsdoc/check-alignment': 'off',
      'jsdoc/check-line-alignment': ['warn', 'any', {
        wrapIndent: '  ',
      }],
      'jsdoc/check-tag-names': [
        'warn',
        {
          definedTags: ['property'],
        },
      ],
      'jsdoc/check-types': 'off',
      'jsdoc/no-defaults': ['warn', {
        contexts: [
          {
            comment: 'JsdocBlock:not(:has(JsdocTag[tag=default]))',
          },
        ],
      }],
      'jsdoc/reject-any-type': 'off',
      'jsdoc/require-jsdoc': ['warn', {
        enableFixer: false,
        require: {
          ClassDeclaration: true,
          ClassExpression: true,
          FunctionDeclaration: true,
          MethodDefinition: true,
        },
      }],
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-property': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': ['warn', 'any', {
        startLines: 1,
      }],
    },
  }),
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  stylistic.configs.customize({
    semi: true,
    arrowParens: true,
    severity: 'warn',
  }),

  // Main configuration
  {
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      // parser: '@typescript-eslint/parser',
      // parserOptions: {
      //   requireConfigFile: false,
      // },
      parserOptions: /** @type {import('@typescript-eslint/parser').ParserOptions} */ ({
        project: [
          './jsconfig.json',
          './src/jsconfig.json',
          './src/worker/jsconfig.json',
          './src/shared/jsconfig.json',
          './tests/jsconfig.json',
          './config/jsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
        // jsDocParsingMode: 'all',
      }),
      globals: {
        CONFIG_FILE_NAME: 'readonly',
        IS_DEV: 'readonly',
        IS_TEST: 'readonly',
        IS_SINGLE: 'readonly',
        LANG_CODE: 'readonly',

        mw: 'readonly',
        $: 'readonly',
        OO: 'readonly',
        moment: 'readonly',

        convenientDiscussions: 'readonly',
        getInterwikiPrefixForHostname: 'readonly', // en:User:Jack who built the house/getUrlFromInterwikiLink.js
        getInterwikiPrefixForHostnameSync: 'readonly', // en:User:Jack who built the house/getUrlFromInterwikiLink.js
        getUrlFromInterwikiLink: 'readonly', // en:User:Jack who built the house/getUrlFromInterwikiLink.js

        cdOnlyRunByFooterLink: 'readonly',
        cdShowLoadingOverlay: 'readonly',
      },
    },
    plugins: {
      'no-one-time-vars': noOneTimeVars,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      'prefer-const': ['warn', {
        destructuring: 'all',
      }],
      'arrow-body-style': ['error', 'as-needed'],
      'prefer-arrow-callback': 'error',
      'one-var': ['error', 'never'],
      'no-promise-executor-return': 'error',
      'no-constructor-return': 'error',
      'default-param-last': 'error',
      'object-shorthand': 'error',
      'no-lonely-if': 'warn',
      'func-style': ['error', 'declaration', {
        allowArrowFunctions: true,
      }],
      'no-new': 'error',
      'func-names': 'error',
      'no-else-return': 'error',
      'prefer-regex-literals': 'error',
      'eqeqeq': 'error',
      'no-lone-blocks': 'error',
      'prefer-object-spread': 'error',

      // Limits on sizes
      // 'max-params': ['warn', 4],
      // 'max-lines-per-function': ['warn', {
      //   max: 100,
      //   skipBlankLines: true,
      //   skipComments: true,
      // }],
      // 'max-statements': ['warn', 40],
      // 'max-classes-per-file': ['error', {
      //   ignoreExpressions: true,
      // }],
      // 'max-nested-callbacks': ['warn', 5],
      // 'max-depth': ['warn', 5],

      // We use these for text masking
      'no-control-regex': 'off',
      'no-constant-condition': ['error', {
        checkLoops: false,
      }],

      // Those are useful in array destructuring
      'no-sparse-arrays': 'off',

      // Overriden by @typescript-eslint/class-methods-use-this
      'class-methods-use-this': 'off',

      // Handled by TypeScript
      'no-undef': 'off',
      'no-unused-expressions': 'off',

      // Enabled in TypeScript with strictNullChecks
      'no-unsafe-optional-chaining': 'off',

      // Handled by @typescript-eslint
      'no-unused-vars': 'off',

      // Impractical strict rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowAny: false,
        allowBoolean: false,
        allowNever: false,
        allowNullish: false,
        allowNumber: true,
        allowRegExp: false,
      }],
      '@typescript-eslint/no-dynamic-delete': 'off',

      // We use inline require() because some global identifiers like OO.ui become available to us
      // only after they are loaded with mw.loader.
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'unicorn/prefer-module': 'off',

      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        args: 'all',
      }],
      '@typescript-eslint/no-misused-promises': ['error', {
        checksConditionals: false,
        checksVoidReturn: false,
      }],

      // I (jwbth) prefer types, but there are some uses for interfaces, e.g. to match @types/ooui
      '@typescript-eslint/consistent-type-definitions': 'off',

      // Used when extending OOUI classes, e.g. to match the style of @types/ooui
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',

      // Many legit uses
      '@typescript-eslint/no-floating-promises': 'off',

      // @typescript-eslint doesn't seem to do type narrowing well anyway
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Temporarily disable until we make sure this doesn't increase file size or debugging or
      // users (e.g. somebody wants to use an old browser). This is also useful for ternary
      // expressions (e.g. `variable === undefined ? ... : variable`) but they can't be enabled
      // individually.
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/parameter-properties': 'error',
      '@typescript-eslint/no-shadow': 'error',
      // '@typescript-eslint/class-methods-use-this': ['error', {
      //   enforceForClassFields: true,
      //   ignoreOverrideMethods: true,
      // }],
      '@typescript-eslint/no-unnecessary-condition': ['warn', {
        allowConstantLoopConditions: true,
      }],
      '@typescript-eslint/prefer-promise-reject-errors': 'off',

      // We use it only when necessary.
      '@typescript-eslint/no-this-alias': 'off',

      // We have a use for empty classes - see mixInObject()
      '@typescript-eslint/no-extraneous-class': ['error', {
        allowEmpty: true,
      }],

      // We use it for Tribute
      '@typescript-eslint/ban-ts-comment': 'off',

      // {} is neat in conditional types with conditional object props, e.g.
      // `AD extends false ? { date: Date } : {}`
      '@typescript-eslint/no-empty-object-type': 'off',

      // I (jwbth) consider .match() to be more readable simply because chaining with
      // c.h.a.i.n.match() is more readable than backwards reading with .exec(c.h.a.i.n), especially
      // if the chain is multiline.
      '@typescript-eslint/prefer-regexp-exec': 'off',

      // Wait until enough browsers support it
      'unicorn/prefer-string-replace-all': 'off',
      'unicorn/prefer-at': 'off',
      'unicorn/no-array-reverse': 'off',
      'unicorn/prefer-structured-clone': 'off',

      // Popular abbreviations like `el` or `i` are simultaneously the ones that don't need to be
      // expanded because they are commonly understood
      'unicorn/prevent-abbreviations': 'off',

      // Not critical/relevant/helpful
      'unicorn/explicit-length-check': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/catch-error-name': 'off',
      'unicorn/no-typeof-undefined': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/no-single-promise-in-promise-methods': 'off',

      // .substring() swaps values if start > end
      'unicorn/prefer-string-slice': 'off',

      // Callback references make the code neat (e.g. `.filter(defined)`), but the concern of the
      // rule is legit, so better not use this trick in less obvious places
      'unicorn/no-array-callback-reference': 'off',

      // Less readable for me (jwbth)
      'unicorn/prefer-regexp-test': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/no-nested-ternary': 'off',

      'unicorn/consistent-function-scoping': ['error', {
        checkArrowFunctions: false,
      }],
      'unicorn/no-abusive-eslint-disable': 'off',

      // .innerText has legitimate usages.
      'unicorn/prefer-dom-node-text-content': 'off',

      'unicorn/prefer-ternary': 'warn',

      // I (jwbth) never do that, and the rule gives false positives with any methods named .filter()
      'unicorn/no-array-method-this-argument': 'off',

      'unicorn/no-lonely-if': 'warn',

      // Duplicated @typescript-eslint/no-this-alias
      'unicorn/no-this-assignment': 'off',

      // Turn off for now
      'unicorn/no-null': 'off',

      // Confuses OO.EventEmitter for Node's EventEmitter
      'unicorn/prefer-event-target': 'off',

      // The default kills `undefined`s in .reduce() where they are typed. ...And in default parameters
      // 'unicorn/no-useless-undefined': ['error', {
      //   checkArguments: false,
      // }],
      'unicorn/no-useless-undefined': 'off',

      // We have files with JSDoc types
      'unicorn/no-empty-file': 'off',

      // We build with an old babel-loader which doesn't support this
      'unicorn/prefer-top-level-await': 'off',

      // Import plugin rules
      'import/order': [
        'warn',
        {
          'alphabetize': {
            caseInsensitive: false,
            order: 'asc',
          },
          'newlines-between': 'always',
        },
      ],
      'import/no-named-as-default-member': 'off',

      '@stylistic/no-multi-spaces': ['warn', {
        ignoreEOLComments: true,
      }],
      '@stylistic/comma-dangle': ['warn', {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        functions: 'only-multiline',
      }],
      '@stylistic/brace-style': ['warn', '1tbs'],
      '@stylistic/arrow-parens': 'warn',
      '@stylistic/lines-between-class-members': ['warn', {
        enforce: [
          {
            blankLine: 'always',
            prev: 'method',
            next: 'method',
          },
        ],
      }],
      '@stylistic/array-bracket-newline': ['warn', 'consistent'],
      '@stylistic/array-element-newline': ['warn', 'consistent'],
      '@stylistic/object-property-newline': ['warn', {
        allowAllPropertiesOnSameLine: true,
      }],
      '@stylistic/object-curly-newline': ['warn', {
        consistent: true,
        multiline: true,
      }],
      '@stylistic/max-len': ['warn', {
        code: 110,  // Non-rigid 100; it doesn't autofix anyway
        tabWidth: 2,
        ignoreComments: true,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      '@stylistic/operator-linebreak': ['warn', 'after', {
        overrides: {
          '?': 'before',
          ':': 'before',
        },
      }],
      '@stylistic/newline-per-chained-call': ['warn', {
        ignoreChainWithDepth: 3,
      }],
      '@stylistic/padding-line-between-statements': [
        'warn',
        // Always require a blank line before any return
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
      ],

      // Trimmed on save by IDE
      '@stylistic/no-trailing-spaces': 'off',

      '@stylistic/indent': ['warn', 2, {
        SwitchCase: 1,
        offsetTernaryExpressions: true,
      }],

      // Attacks JSDoc comments like `.../** @type {string} */ (smth)`
      '@stylistic/rest-spread-spacing': 'off',
      '@stylistic/space-unary-ops': 'off',
      '@stylistic/array-bracket-spacing': 'off',

      '@stylistic/quotes': ['warn', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'always',
      }],

      'no-one-time-vars/no-one-time-vars': 'off',
      // No one-time vars plugin rules
      // 'no-one-time-vars/no-one-time-vars': ['warn', {
      //   allowedVariableLength: 9_999_999,  // Allow any length
      //   ignoreObjectDestructuring: true,
      //   ignoreTemplateLiterals: true,
      // }],

      // Slow rules (run `cross-env TIMING=1 eslint --config eslint.config.mjs --fix-dry-run src/`)
      'unicorn/no-unnecessary-polyfills': 'off',
    },
  },

  // Overrides for JS
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
      },
    },
  },

  // Overrides for specific files
  {
    files: ['*', 'src/tribute/**', 'jsdoc/**', '**/*.test.js'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },

  // Partial ES2022 compatibility: Allows .at() and .findLastIndex() (with polyfills) but restricts
  // other ES2022+ features
  {
    files: ['src/**/*'],
    ignores: ['src/tribute/**'],
    plugins: {
      // @ts-expect-error - Type definition mismatch with flat config
      'es-x': esX,
    },
    rules: {
      // Restrict to ES2022, but allow .at() and .findLastIndex() since we have polyfills
      'es-x/no-array-prototype-toreversed': 'error',
      'es-x/no-array-prototype-tosorted': 'error',
      'es-x/no-array-prototype-tospliced': 'error',
      'es-x/no-array-prototype-with': 'error',
    },
  },

  {
    files: ['config/**/*'],
    plugins: {
      'es-x': esX,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...esX.configs['no-new-in-es2016'].rules,
      ...esX.configs['no-new-in-es2017'].rules,
      ...esX.configs['no-new-in-es2018'].rules,
      ...esX.configs['no-new-in-es2019'].rules,
      ...esX.configs['no-new-in-es2020'].rules,
      ...esX.configs['no-new-in-es2021'].rules,
      ...esX.configs['no-new-in-es2022'].rules,
      ...esX.configs['no-new-in-es2023'].rules,
      ...esX.configs['no-new-in-es2024'].rules,
    },
  },

  {
    files: ['src/shared/**', 'src/worker/**'],
    rules: {
      'unicorn/prefer-query-selector': 'off',
      'unicorn/prefer-dom-node-dataset': 'off',
    },
  },

  {
    files: ['**/*.d.ts'],
    rules: {
      // Disable some rules that are not applicable to declaration files
      // 'no-unused-vars': 'off',
      'jsdoc/require-jsdoc': 'off',
      'unicorn/require-module-specifiers': 'off',
      '@stylistic/operator-linebreak': 'off',
    },
  },
);

export default config;
