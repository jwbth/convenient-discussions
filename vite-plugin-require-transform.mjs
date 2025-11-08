/**
 * Vite plugin to transform require() calls to dynamic import() for ES modules.
 *
 * This plugin handles two types of require() usage:
 * 1. CSS/Less imports: require('./styles.less') -> import './styles.less' (static)
 * 2. Module imports: require('./Module').default -> (await import('./Module.js')).default
 *
 * Note: Does NOT transform mw.loader.require() (MediaWiki's module system)
 *
 * Strategy:
 * - CSS imports are moved to the top as static imports
 * - Module imports use dynamic import() which returns a Promise
 * - For top-level require() calls, we use .then() instead of await
 * - For require() inside functions, we keep them as-is and let the developer handle async
 *
 * @returns {import('vite').Plugin}
 */
export function requireTransformPlugin() {
  return {
    name: 'require-transform',
    enforce: 'pre',

    transform(code, id) {
      // Skip node_modules and non-JS files
      if (id.includes('node_modules') || !id.endsWith('.js')) {
        return null;
      }

      // Skip if no require() calls exist
      if (!code.includes('require(')) {
        return null;
      }

      // Skip if only mw.loader.require() exists
      const requireMatches = code.match(/require\(/g);
      if (!requireMatches) {
        return null;
      }

      let transformed = code;
      let hasChanges = false;

      // Pattern 1: CSS/Less imports - convert to static imports at top
      // require('./styles.less') -> import './styles.less'
      const cssRequirePattern = /require\(['"]([^'"]+\.(?:less|css))['"]\);?/g;
      /** @type {string[]} */
      const cssImports = [];

      transformed = transformed.replace(cssRequirePattern, (_match, cssPath) => {
        // Skip mw.loader.require
        if (_match.includes('mw.loader.')) {
          return _match;
        }

        cssImports.push(cssPath);
        hasChanges = true;

        return '/* CSS import moved to top */';
      });

      // Add CSS imports at the beginning (after existing imports)
      if (cssImports.length > 0) {
        const importInsertPos = transformed.search(/\n\n(?!import\s)/);
        const cssImportStatements = cssImports.map((p) => `import '${p}';`).join('\n');

        transformed = importInsertPos > 0
          ? transformed.substring(0, importInsertPos) + '\n' + cssImportStatements + transformed.substring(importInsertPos)
          : cssImportStatements + '\n\n' + transformed;
      }

      // Pattern 2: Module imports with .default
      // require('./Module').default -> import('./Module.js').then(m => m.default)
      // This works at top-level without async/await
      const moduleRequirePattern = /(?<!mw\.loader\.)require\(['"]([^'"]+)['"]\)\.default/g;
      transformed = transformed.replace(moduleRequirePattern, (_match, modulePath) => {
        hasChanges = true;
        const jsPath = modulePath.endsWith('.js') ? modulePath : `${modulePath}.js`;

        // Use dynamic import which returns a Promise
        // The caller will need to handle the Promise (either await or .then())
        return `import('${jsPath}').then(m => m.default)`;
      });

      // Pattern 3: Simple module imports without .default
      // require('./Module') -> import('./Module.js')
      // But exclude CSS/Less files (already handled)
      const simpleRequirePattern = /(?<!mw\.loader\.)require\(['"]([^'"]+(?<!\.less)(?<!\.css))['"]\)(?!\.default)/g;
      transformed = transformed.replace(simpleRequirePattern, (_match, modulePath) => {
        hasChanges = true;
        const jsPath = modulePath.endsWith('.js') ? modulePath : `${modulePath}.js`;

        // Use dynamic import which returns a Promise
        return `import('${jsPath}')`;
      });

      return hasChanges ? { code: transformed, map: null } : null;
    },
  };
}
