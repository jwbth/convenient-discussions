import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import nonNullableConfig from './config.mjs';

/** @type {DeepPartial<typeof nonNullableConfig>} */
const cdConfig = nonNullableConfig;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} BuildMode
 * @property {boolean} isDev
 * @property {boolean} isStaging
 * @property {boolean} isSingle
 * @property {string} [project]
 * @property {string} [lang]
 * @property {string} [wiki]
 * @property {string} filenamePostfix
 */

/**
 * Determine the build mode from environment variables.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} mode
 * @returns {BuildMode}
 */
function determineBuildMode(env, mode) {
  const isDev = Boolean(env.VITE_DEV || process.env.npm_config_dev || mode === 'development');
  const isStaging = Boolean(env.VITE_STAGING || process.env.npm_config_staging);
  const isSingle = Boolean(env.VITE_SINGLE || process.env.npm_config_single || mode === 'single');

  let filenamePostfix = '';
  let lang;
  let wiki;
  let project;

  if (isSingle) {
    project = env.VITE_PROJECT || process.env.npm_config_project || 'w';
    lang = env.VITE_LANG || process.env.npm_config_lang || 'en';
    wiki = ['w', 'b', 'n', 'q', 's', 'v', 'voy', 'wikt'].includes(project)
      ? `${project}-${lang}`
      : project;
    filenamePostfix = `.single.${wiki}`;
  } else if (isDev) {
    filenamePostfix = '.dev';
  } else if (isStaging) {
    filenamePostfix = '.staging';
  }

  return {
    isDev,
    isStaging,
    isSingle,
    project,
    lang,
    wiki,
    filenamePostfix,
  };
}

export default defineConfig(({ mode }) => {
  const buildMode = determineBuildMode(process.env, mode);
  const bundleFilename = `convenientDiscussions${buildMode.filenamePostfix}`;

  if (!cdConfig.protocol || !cdConfig.main?.rootPath || !cdConfig.articlePath) {
    throw new Error('No protocol/server/root path/article path found in config.json5.');
  }

  return {
    build: {
      // Output directory
      outDir: 'dist',

      // Target browsers using browserslist (ES2020 supports all required transforms)
      target: 'es2020',

      // Entry point and output configuration
      rollupOptions: {
        input: path.resolve(__dirname, 'src/app.js'),
        output: {
          // Output filename with mode-specific postfix
          entryFileNames: `${bundleFilename}.js`,

          // Module format (IIFE for browser global)
          format: 'iife',

          // Disable code splitting (single output file)
          inlineDynamicImports: true,
        },
      },

      // Disable code splitting
      cssCodeSplit: false,
    },

    // esbuild configuration for JavaScript transformation
    esbuild: {
      // Target ES2020 for browser compatibility
      target: 'es2020',

      // esbuild natively supports all required transforms:
      // - class properties
      // - class static blocks
      // - logical assignment operators
      // - nullish coalescing
      // - optional catch binding
      // - optional chaining
      // - numeric separators
    },

    // CSS preprocessing configuration
    css: {
      preprocessorOptions: {
        less: {
          // Less-specific options can be added here if needed
        },
      },
      postcss: {
        plugins: [
          {
            postcssPlugin: 'filter-mediawiki-urls',
            Declaration(decl) {
              // Filter out URLs starting with /w/ (MediaWiki paths)
              // Note: Vite's CSS processing automatically handles URL filtering
              // This plugin serves as a placeholder for any custom URL filtering logic
              if ((decl.prop.includes('url') || decl.value.includes('url(')) &&
                decl.value.match(/url\(['"]?\/w\/[^'"()]+['"]?\)/)) {
                // URLs starting with /w/ are MediaWiki paths and should not be processed
                // Vite will leave them as-is by default
              }
            },
          },
        ],
      },
    },

    // Module resolution
    resolve: {
      extensions: ['.js', '.json'],
    },

    // Worker configuration
    worker: {
      format: 'iife',
      rollupOptions: {
        output: {
          // Worker filename with mode-specific postfix
          entryFileNames: `convenientDiscussions.worker${buildMode.filenamePostfix}.js`,
        },
      },
    },

    // Development server configuration
    server: {
      // Port configuration
      port: 9000,

      // CORS headers for cross-origin development access
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['*'],
      },

      // HMR configuration
      hmr: {
        // WebSocket configuration
        protocol: 'ws',
        host: 'localhost',
        port: 9000,
        path: '/ws',
      },

      // Static file serving
      fs: {
        // Allow serving files from dist directory
        strict: false,
      },

      // Hot reload behavior - only reload on successful updates
      // This prevents full page reload on errors
      watch: {
        // Watch options
        ignored: ['**/node_modules/**', '**/dist/**'],
      },
    },

    // Preview server configuration (for production builds)
    preview: {
      port: 9000,
      cors: {
        origin: '*',
      },
    },
  };
});
