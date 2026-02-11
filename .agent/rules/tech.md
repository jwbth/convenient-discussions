---
trigger: always_on
---

# Technology Stack

## Core Technologies

- **JavaScript (ES2020)**: Main development language with modern syntax support
- **TypeScript**: Strict type checking via JSDoc comments and .d.ts files (no compilation)
- **Webpack 5**: Module bundling and build system
- **Babel**: JavaScript transpilation with modern feature support
- **Less**: CSS preprocessing for styling

## Key Dependencies

### Runtime Dependencies

- **date-fns/date-fns-tz**: Date/time manipulation and timezone handling
- **htmlparser2**: HTML parsing for comment/section processing
- **lz-string**: String compression for storage optimization

### Development Dependencies

- **ESLint**: Code linting with TypeScript, JSDoc, and Unicorn, and Stylistic plugins
- **Jest**: Testing framework
- **CodeMirror 6**: Rich text editing capabilities

## Build System

### Common Commands

```bash
# Development server with hot reload
npm run start

# Production build
npm run build

# Development build
npm run build:dev

# Staging build (with .staging postfix)
npm run build:staging

# Single-file build for specific wiki (NOTE: two `--` for Powershell)
npm run single -- -- --project w --lang en

# Run tests
npm run test

# Run browser tests in Playwright
npm run test:browser

# Run browser tests in Playwright with a headed browser (NOTE: two `--` for Powershell)
npm run test:browser -- -- --headed

# Generate documentation
npm run docs

# Build configurations only
npm run configs

# Build i18n files only
npm run i18n
```

### Build Modes

- **Development**: Source maps, no minification, served at localhost:9000
- **Production**: Minified, optimized, with license extraction
- **Test**: Production build with .test filename postfix
- **Single**: All-in-one file including config and i18n for specific wiki

## MediaWiki Integration

- **Target Environment**: MediaWiki user scripts/gadgets
- **Global Objects**: Relies on `mw`, `$` (jQuery), `OO` (OOJS/OOUI)
- **Module System**: Uses MediaWiki's ResourceLoader modules
- **Deployment**: Multi-wiki configuration system via config.json5
