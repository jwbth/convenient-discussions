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

      // Target browsers using browserslist
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
  };
});
