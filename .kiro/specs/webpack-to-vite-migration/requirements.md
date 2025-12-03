# Requirements Document

## Introduction

This document outlines the requirements for migrating the Convenient Discussions project from Webpack 5 to Vite as the primary build system. The migration must maintain all existing functionality while potentially improving build performance and developer experience.

## Glossary

- **Build_System**: The tooling responsible for bundling, transforming, and serving the application code
- **Vite_Config**: The Vite configuration file that defines build behavior and plugins
- **Bundle_Modes**: The four distinct build configurations (production, dev, staging, single)
- **Source_Maps**: Files that map minified code back to original source for debugging
- **Web_Worker**: JavaScript code that runs in a separate thread from the main application
- **MediaWiki_Environment**: The target runtime environment where the bundled code will execute
- **Rollup**: The bundler used by Vite for production builds, providing advanced bundling capabilities
- **esbuild**: The fast JavaScript/TypeScript transformer used by Vite for development and optionally for production minification

## Requirements

### Requirement 1

**User Story:** As a developer, I want to migrate from Webpack to Vite, so that I can benefit from faster build times and improved developer experience.

#### Acceptance Criteria

1. WHEN the migration is complete, THE Build_System SHALL use Vite instead of Webpack for all build operations
2. THE Build_System SHALL maintain all four existing Bundle_Modes (production, dev, staging, single)
3. THE Build_System SHALL preserve all existing npm script commands and their functionality
4. THE Build_System SHALL generate identical output file structures as the current Webpack configuration
5. THE Build_System SHALL maintain compatibility with the MediaWiki_Environment

### Requirement 2

**User Story:** As a developer, I want to preserve all build customizations, so that the application continues to work correctly in the MediaWiki environment.

#### Acceptance Criteria

1. THE Build_System SHALL include custom banner comments with `<nowiki>` (top) and `</nowiki>` (bottom) wrappers (in code comments)
2. THE Build_System SHALL generate Source_Maps with external URLs for production builds
3. THE Build_System SHALL handle inline Web_Worker bundling with appropriate Source_Maps
4. THE Build_System SHALL apply custom minification settings using Vite's native tools for production builds
5. THE Build_System SHOULD extract license comments to separate files with custom banners

### Requirement 3

**User Story:** As a developer, I want to maintain the existing development server functionality, so that I can continue using hot module replacement during development.

#### Acceptance Criteria

1. THE Build_System SHOULD serve the development build at localhost:9000 with hot module replacement
2. THE Build_System SHALL include CORS headers for cross-origin development access
3. THE Build_System SHOULD support WebSocket connections for hot reload functionality
4. THE Build_System SHALL maintain the existing file serving structure during development
5. THE Build_System SHALL preserve build notifications for successful/failed builds

### Requirement 4

**User Story:** As a developer, I want to preserve all asset processing capabilities, so that styles and workers continue to function correctly.

#### Acceptance Criteria

1. THE Build_System SHALL process Less files and inject styles into the DOM
2. THE Build_System SHALL allow to import styles as strings or CSSStyleSheet objects
3. THE Build_System SHALL handle CSS URL filtering to exclude MediaWiki paths
4. THE Build_System SHALL process JavaScript files using Vite's native transformation capabilities or compatible plugins
5. THE Build_System SHALL bundle the Web_Worker inline with proper filename generation
6. THE Build_System SHALL maintain all existing file extensions and resolution patterns

### Requirement 5

**User Story:** As a developer, I want to preserve environment-specific build behavior, so that different deployment targets continue to work correctly.

#### Acceptance Criteria

1. THE Build_System SHALL generate different filename postfixes based on build mode (.dev, .staging, .single.{wiki})
2. THE Build_System SHALL inject appropriate environment variables (IS_DEV, IS_STAGING, IS_SINGLE, etc.)
3. THE Build_System SHALL handle single-build mode with embedded configuration and localization
4. THE Build_System SHALL maintain different Source_Maps strategies per build mode
5. THE Build_System SHOULD preserve all existing optimization settings per build mode

### Requirement 6

**User Story:** As a developer, I want to use Vite's native ecosystem tools, so that I can benefit from better performance and modern tooling.

#### Acceptance Criteria

1. THE Build_System SHALL use esbuild for JavaScript transformation during development and optionally for production
2. THE Build_System SHALL use Rollup for production bundling with Vite's optimized configuration
3. THE Build_System SHALL use esbuild or Rollup's native minification instead of Terser where possible
4. THE Build_System SHALL use Vite's native CSS processing instead of separate loaders where possible
5. THE Build_System SHALL use Vite plugins for specialized functionality (workers, banners, etc.)
6. THE Build_System MAY fall back to compatibility plugins only when Vite's native tools cannot meet specific requirements
