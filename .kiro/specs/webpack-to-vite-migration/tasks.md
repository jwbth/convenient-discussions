# Implementation Plan

- [x] 1. Install Vite and configure basic setup






  - [x] 1.1 Install Vite dependencies

    - Install vite as a dev dependency
    - Install vite-plugin-banner for banner injection
    - Install any other required Vite plugins
    - _Requirements: 1.1, 6.1, 6.5_


  - [x] 1.2 Create vite.config.mjs with build mode detection

    - Implement determineBuildMode function to detect dev, staging, single modes from env variables
    - Parse project and lang parameters for single builds
    - Generate filename postfix based on build mode (.dev, .staging, .single.{wiki})
    - Set up basic Vite config structure with mode-based configuration
    - _Requirements: 1.2, 5.1, 5.2_


  - [x] 1.3 Configure build options

    - Set entry point to src/app.js using build.rollupOptions.input
    - Configure output directory to dist/
    - Set up filename generation with mode-specific postfixes
    - Configure module format (iife) and target browsers using browserslist
    - Disable code splitting (single output file)
    - _Requirements: 1.4, 5.1, 6.2_

- [x] 2. Configure asset processing




  - [x] 2.1 Set up Less preprocessing


    - Configure Vite's native CSS preprocessing for Less files
    - Ensure styles are injected into DOM by default
    - Support importing stylesheets as strings using `?inline` suffix (e.g., `import styles from './styles.less?inline'`)
    - Add PostCSS plugin or custom handling to filter CSS URLs excluding MediaWiki paths (/w/)
    - _Requirements: 4.1, 4.2, 4.3, 6.4_

  - [x] 2.2 Configure worker bundling


    - Update worker import in src/convenientDiscussions.js to use `?worker&inline` suffix
    - Configure Vite's worker options for inline bundling (worker.format: 'iife')
    - Ensure worker is embedded as blob URL in main bundle
    - Verify worker filename generation includes mode postfix
    - _Requirements: 2.3, 4.5, 6.5_

  - [x] 2.3 Configure JavaScript transformation


    - Set up esbuild target for browser compatibility (ES2020)
    - Configure module resolution and extensions (.js, .json)
    - Verify esbuild can handle all Babel transforms: class properties, class static blocks, logical assignment, nullish coalescing, optional catch binding, optional chaining, numeric separators
    - If esbuild cannot handle all transforms for target browsers, add @vitejs/plugin-legacy or keep minimal Babel setup
    - _Requirements: 4.4, 6.1_

- [x] 3. Configure development server





  - Set up dev server on port 9000
  - Configure CORS headers (Access-Control-Allow-Origin: *)
  - Configure HMR with WebSocket on ws://localhost:9000/ws
  - Set static file serving from dist/
  - Configure hot reload behavior (hot: 'only')
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Implement source map configuration






  - [ ] 4.1 Configure development source maps



    - Set build.sourcemap: 'inline' for dev mode
    - Set build.sourcemap: 'eval' for single mode
    - _Requirements: 5.4_



  - [x] 4.2 Configure production source maps



    - Set build.sourcemap: true for production/staging builds to generate .map files
    - Create custom plugin to inject custom source map URL using sourceMapsBaseUrl from config
    - Attempt to generate single shared source map for main bundle and inline worker (preferred but may not be feasible)
    - If single source map not feasible, generate separate source maps for main and worker
    - _Requirements: 2.2, 5.4_

- [x] 5. Create custom Vite plugins




  - [x] 5.1 Create nowiki banner plugin


    - Use vite-plugin-banner or custom plugin to prepend `/* <nowiki> */` to output
    - Create custom plugin to append `/* </nowiki> */` to output
    - Apply only to main bundle (not worker) and only for non-single builds
    - _Requirements: 2.1_

  - [x] 5.2 Create license extraction plugin


    - Extract license comments (/@preserve|@license|@cc_on/i) from main bundle code
    - Extract license comments from inline worker code
    - Generate .LICENSE.js file(s) with extracted licenses (single file preferred, separate files acceptable if complex)
    - Add custom banner with documentation URL and license file reference
    - _Requirements: 2.5_

  - [x] 5.3 Create build notification plugin


    - Implement plugin using buildEnd and buildError hooks
    - Suppress success and warning notifications (only show errors) unless it's the first successful build after an error
    - Match webpack-build-notifier behavior
    - _Requirements: 3.5_

- [x] 6. Configure environment variables and optimization




  - [x] 6.1 Set up environment defines


    - Configure define for IS_DEV, IS_STAGING
    - Configure define for SINGLE_CONFIG_FILE_NAME and SINGLE_LANG_CODE (set to wiki and lang for single builds, undefined otherwise)
    - Ensure variables are replaced at build time to enable conditional require() calls in app.js
    - _Requirements: 5.2, 5.3_

  - [x] 6.2 Configure minification


    - Use esbuild minifier with custom options
    - Preserve class names (minify.keepNames: true)
    - Reserve 'cd' identifier from mangling (mangleProps with reserved list)
    - Configure charset: 'ascii' for ASCII-only output
    - Disable sequences and conditionals compression for better debugging
    - _Requirements: 2.4, 6.2, 6.3_

  - [x] 6.3 Configure Rollup optimization


    - Enable tree-shaking (default in Vite)
    - Enable module concatenation (build.rollupOptions.output.hoistTransitiveImports)
    - Disable performance hints (build.chunkSizeWarningLimit: Infinity)
    - _Requirements: 5.5, 6.2_

- [x] 7. Update npm scripts and remove Webpack






  - [x] 7.1 Update package.json scripts

    - Update build script: `node buildConfigs.mjs && node buildI18n.mjs && vite build`
    - Update start script: `node buildConfigs.mjs && node buildI18n.mjs && vite`
    - Update serve script: `vite --mode development`
    - Update single script: `node buildConfigs.mjs && node buildI18n.mjs && vite build --mode single`
    - Remove webpack script
    - _Requirements: 1.3_


  - [x] 7.2 Remove Webpack dependencies

    - Remove webpack, webpack-cli, webpack-dev-server from package.json
    - Remove babel-loader, css-loader, less-loader, style-loader, worker-loader
    - Remove terser-webpack-plugin, webpack-build-notifier
    - Run npm install to update package-lock.json
    - _Requirements: 1.1, 6.1, 6.3_

- [ ] 8. Test and validate all build modes
  - [ ] 8.1 Test production build
    - Run `npm run build` and verify output files in dist/
    - Check source maps are external with .map extension
    - Verify nowiki tags are present at top and bottom
    - Verify minification and optimization
    - Check LICENSE.js file(s) are generated with worker licenses included
    - Compare bundle size with Webpack output
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.5_

  - [ ] 8.2 Test development server
    - Run `npm start` and verify server starts on localhost:9000
    - Check HMR works by modifying a source file
    - Verify CORS headers are present in response
    - Check source maps are inline
    - Test hot reload functionality
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 8.3 Test staging build
    - Run `npm run build --staging` and verify .staging postfix in filename
    - Check nowiki tags are present
    - Verify all production features work with staging mode
    - _Requirements: 1.2, 2.1, 5.1_

  - [ ] 8.4 Test single build
    - Run `npm run single -- project=w lang=en` and verify .single.w-en postfix
    - Verify no nowiki tags are present
    - Check source maps use eval format
    - Test with different project/lang combinations
    - Verify inline config and i18n work correctly
    - _Requirements: 1.2, 5.1, 5.3_

- [ ] 9. Update documentation and cleanup
  - Update README.md with new build commands if needed
  - Update "Building" section in homepage.wiki
  - Remove webpack.config.mjs
  - Evaluate if babel.config.js can be removed (Vite uses esbuild by default)
  - Update .kiro/steering/tech.md to reflect Vite instead of Webpack
  - _Requirements: 1.1_