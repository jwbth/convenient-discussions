/**
 * Vite plugin to fix inline worker code that gets broken by minification.
 *
 * When a worker is inlined with ?worker&inline, Vite embeds it as a string literal.
 * The minifier can break this by incorrectly escaping quotes in the embedded code.
 *
 * This plugin runs after minification and fixes any broken string literals in the
 * inlined worker code.
 *
 * @returns {import('vite').Plugin}
 */
export function fixInlineWorkerPlugin() {
  return {
    name: 'fix-inline-worker',
    apply: 'build',
    enforce: 'post',

    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          let code = chunk.code;
          let modified = false;

          // Pattern: Look for inline worker code that starts with a variable assignment
          // followed by a string literal containing the worker code
          // Example: io='var S=Object.defineProperty...
          // or: fo='var __defProp=Object.defineProperty...

          // The issue is that the minifier creates: varName='worker code here'
          // but the worker code itself contains unescaped quotes, breaking the string

          // Solution: Find these patterns and ensure the worker code is properly escaped
          // by converting single quotes to template literals or escaping them

          // Find patterns like: \w+='var \w+=Object\.defineProperty
          const workerPattern = /(\w+)='(var \w+=Object\.defineProperty[^]*?)(?=\n|$)/g;

          code = code.replace(workerPattern, (match, varName, workerCode) => {
            // Check if this looks like broken worker code (has unmatched quotes)
            const singleQuotes = (workerCode.match(/'/g) || []).length;
            const doubleQuotes = (workerCode.match(/"/g) || []).length;

            // If there are unmatched quotes, this is likely broken
            // Convert to template literal to avoid quote issues
            if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
              // Escape backticks and ${} in the worker code
              const escapedCode = workerCode
                .replace(/\\/g, '\\\\')
                .replace(/`/g, '\\`')
                .replace(/\$\{/g, '\\${');

              modified = true;
              return `${varName}=\`${escapedCode}\``;
            }

            return match;
          });

          if (modified) {
            chunk.code = code;
            console.log(`Fixed inline worker quotes in ${fileName}`);
          }
        }
      }
    },
  };
}
