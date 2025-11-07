# Implementation Plan

- [ ] 1. Install Vite and remove Webpack dependencies
  - Install vite as a dev dependency
  - Remove webpack, webpack-cli, webpack-dev-server, and related loaders
  - Remove webpack-specific plugins (terser-webpack-plugin, webpack-build-notifier)
  - Update package.json scripts to use Vite commands
  - _Requirements: 1.1, 1.3, 6.1, 6.2, 6.3_

- [ ] 2. Create basic Vite configuration structure
  - [ ] 2.1 Create vite.config.mjs with build mode detection logic
    - Implement determineBuildMode function to detect dev, staging, single modes
    - Set up environment variable handling for mode detection
    - Create filename postfix logic based on build mode
    - _Requirements: 1.2, 5.1, 5.2_

  - [ ] 2.2 Configure basic build options
    - Set entry point to src/app.js
    - Configure output directory to dist/
    - Set up filename generation with mode-specific postfixes
    - Configure module format and target browsers
    - _Requirements: 1.4, 5.1_

  - [ ] 2.3 Configure development server
    - Set up dev server on port 9000
    - Configure CORS headers for cross-origin access
    - Set up HMR (hot module replacement)
    - Configure WebSocket settings
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Implement asset processing
  - [ ] 3.1 Configure Less processing
    - Set up Vite's native CSS preprocessing for Less files
    - Configure style injection into DOM
    - Implement CSS URL filtering to exclude MediaWiki paths (/w/)
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 3.2 Configure worker bundling
    - Set up Vite's worker configuration for inline bundling
    - Configure worker filename generation with mode-specific postfixes
    - Ensure worker source maps are generated correctly
    - _Requirements: 2.3, 4.5_

  - [ ] 3.3 Configure JavaScript transformation
    - Set up esbuild target for browser compatibility
    - Configure module resolution and extensions
    - Ensure ES2020 features are properly handled
    - _Requirements: 4.4, 6.1_

- [ ] 4. Implement source map configuration
  - [ ] 4.1 Configure development source maps
    - Set up inline source maps for dev mode
    - Configure eval source maps for single mode
    - _Requirements: 5.4_

  - [ ] 4.2 Configure production source maps
    - Set up external source map generation
    - Implement custom source map URL injection using sourceMapsBaseUrl
    - Ensure .map.json extension is used
    - _Requirements: 2.2, 5.4_

  - [ ] 4.3 Configure worker source maps
    - Ensure worker bundles have proper source map references
    - Handle inline worker source map generation
    - _Requirements: 2.3_

- [ ] 5. Create custom Vite plugins
  - [ ] 5.1 Create nowiki banner plugin
    - Implement plugin to prepend `/*! <nowiki> */` to single build output
    - Implement plugin to append `/*! </nowiki> */` to single build output
    - Ensure banner is only added to main bundle, not worker
    - _Requirements: 2.1_

  - [ ] 5.2 Create license extraction plugin
    - Extract license comments from code
    - Generate separate .LICENSE.js files
    - Add custom banner with documentation URL and license file reference
    - Handle worker license file separately
    - _Requirements: 2.5_

  - [ ] 5.3 Create build notification plugin
    - Implement build success/failure notifications
    - Suppress success and warning notifications (only show errors)
    - _Requirements: 3.5_

- [ ] 6. Configure environment variables and defines
  - Implement define configuration for IS_DEV, IS_STAGING, IS_SINGLE
  - Add CONFIG_FILE_NAME and LANG_CODE for single builds
  - Ensure variables are properly replaced at build time
  - _Requirements: 5.2, 5.3_

- [ ] 7. Configure minification and optimization
  - [ ] 7.1 Set up esbuild minification
    - Configure esbuild minifier with appropriate settings
    - Preserve class names (keep_classnames equivalent)
    - Reserve 'cd' identifier from mangling
    - Ensure ASCII-only output for special characters
    - _Requirements: 2.4, 6.2, 6.3_

  - [ ] 7.2 Configure Rollup optimization
    - Enable tree-shaking and module concatenation
    - Configure chunk splitting strategy
    - Set up performance hints configuration
    - _Requirements: 5.5, 6.2_

- [ ] 8. Implement single build mode
  - Configure single build to include config and i18n inline
  - Set up wiki-specific filename generation (.single.{wiki})
  - Ensure proper source map handling for single builds
  - Test with different project/lang combinations
  - _Requirements: 1.2, 5.1, 5.3_

- [ ] 9. Update npm scripts
  - Update build script to use vite build
  - Update start script to use vite with dev mode
  - Update serve script for development server
  - Update single script with proper environment variables
  - Remove NODE_OPTIONS=--openssl-legacy-provider flags (not needed with Vite)
  - _Requirements: 1.3_

- [ ] 10. Verify and test all build modes
  - [ ] 10.1 Test production build
    - Run production build and verify output files
    - Check source maps are external with correct URLs
    - Verify minification and optimization
    - Compare bundle size with Webpack output
    - _Requirements: 1.1, 1.4, 1.5_

  - [ ] 10.2 Test development build
    - Run dev server and verify HMR works
    - Check CORS headers are present
    - Verify source maps are inline
    - Test hot reload functionality
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 10.3 Test staging build
    - Run staging build and verify .staging postfix
    - Check all production features work with staging mode
    - _Requirements: 1.2, 5.1_

  - [ ] 10.4 Test single build
    - Run single build with different wiki configurations
    - Verify .single.{wiki} filename format
    - Check nowiki tags are present
    - Verify inline config and i18n
    - _Requirements: 1.2, 2.1, 5.1, 5.3_

- [ ] 11. Update documentation and cleanup
  - Update README.md with new build commands if needed
  - Remove webpack.config.mjs
  - Remove babel.config.js if no longer needed
  - Update any build-related documentation
  - _Requirements: 1.1_