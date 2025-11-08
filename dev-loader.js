/**
 * Development loader for Convenient Discussions with HMR support.
 *
 * Usage in MediaWiki browser console:
 * 1. Make sure dev server is running (npm start)
 * 2. Navigate to a talk page
 * 3. Copy and paste this entire file into the console, or use the one-liner below
 *
 * One-liner version:
 * document.head.appendChild(Object.assign(document.createElement('script'), {type: 'module', src: 'http://localhost:9000/src/app.js'}));
 *
 * Or save as a bookmarklet:
 * javascript:(function(){document.head.appendChild(Object.assign(document.createElement('script'),{type:'module',src:'http://localhost:9000/src/app.js'}));})();
 */

(function loadConvenientDiscussionsDev() {
  // Check if already loaded
  if (window.convenientDiscussions) {
    console.log('[CD Dev] Already loaded. Reload the page to load a fresh version.');
    return;
  }

  // Create and inject the module script
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'http://localhost:9000/src/app.js';

  script.onload = () => {
    console.log('[CD Dev] Loaded with HMR support');
    console.log('[CD Dev] Edit source files to see changes instantly');
  };

  script.onerror = () => {
    console.error('[CD Dev] Failed to load. Make sure dev server is running (npm start)');
  };

  document.head.appendChild(script);
  console.log('[CD Dev] Loading...');
})();
