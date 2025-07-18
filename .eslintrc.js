module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
  },
  extends: 'eslint:recommended',
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
  ignorePatterns: ['dist/**', 'misc/**', '*.json5', 'w-he.js'],
  overrides: [
    {
      files: ['./*', 'src/tribute/**', 'jsdoc/**', '*.test.js'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        'import/order': 'off',
      },
    },
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    requireConfigFile: false,
  },
  plugins: ['jsdoc', 'import', 'no-one-time-vars'],
  rules: {
    // We use them for text masking
    'no-control-regex': 'off',

    'no-constant-condition': ['error', { checkLoops: false }],
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
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // Enabled in TypeScript with strictNullChecks
    'no-unsafe-optional-chaining': 'off',

    'jsdoc/check-alignment': 'warn',
    'jsdoc/check-param-names': 'warn',
    'jsdoc/check-tag-names': 'warn',
    'jsdoc/check-types': 'warn',
    'jsdoc/implements-on-classes': 'warn',
    'jsdoc/require-jsdoc': [
      'warn',
      {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ClassExpression: true,
        },
      },
    ],
    'jsdoc/require-param': 'warn',
    // "jsdoc/require-param-description": "warn",
    'jsdoc/require-param-name': 'warn',
    'jsdoc/require-param-type': 'warn',
    'jsdoc/require-returns': 'warn',
    'jsdoc/require-returns-check': 'warn',
    // "jsdoc/require-returns-description": "warn",
    'jsdoc/require-returns-type': 'warn',
    'jsdoc/tag-lines': [
      'warn',
      'any',
      {
        startLines: 1,
      },
    ],
    'jsdoc/check-line-alignment': ['warn', 'any', { 'wrapIndent': '  ' }],

    'no-one-time-vars/no-one-time-vars': ['warn', {
      allowedVariableLength: 9999999,  // Allow any length
      ignoreObjectDestructuring: true,
      ignoreTemplateLiterals: true,
    }],
  },
};
