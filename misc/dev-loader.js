/**
 * Development loader for Convenient Discussions with HMR support.
 *
 * Usage in MediaWiki browser console:
 * 1. Make sure dev server is running (npm start)
 * 2. Navigate to a talk page
 * 3. Copy and paste this entire file into the console, or use the one-liner below
 *
 * One-liner version:
 * (function(){fetch('http://localhost:9000/src/loader/startup.js').then(r=>r.text()).then(c=>{const s=document.createElement('script');s.type='module';s.src=URL.createObjectURL(new Blob([c],{type:'application/javascript'}));document.head.appendChild(s);});})();
 *
 * Or save as a bookmarklet:
 * javascript:(function(){fetch('http://localhost:9000/src/loader/startup.js').then(r=>r.text()).then(c=>{const s=document.createElement('script');s.type='module';s.src=URL.createObjectURL(new Blob([c],{type:'application/javascript'}));document.head.appendChild(s);});})();
 */

;(function loadConvenientDiscussionsDev() {
	// Check if already loaded
	if (window.convenientDiscussions) {
		console.log('[CD Dev] Already loaded. Reload the page to load a fresh version.')

		return
	}

	console.log('[CD Dev] Loading...')

	// Fetch the module script and create a blob URL to bypass CSP
	fetch('http://localhost:9000/src/loader/startup.js')
		.then(response => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			return response.text()
		})
		.then(code => {
			const blob = new Blob([code], { type: 'application/javascript' })
			const blobUrl = URL.createObjectURL(blob)

			const script = document.createElement('script')
			script.type = 'module'
			script.src = blobUrl

			script.addEventListener('load', () => {
				console.log('[CD Dev] Loaded with HMR support')
				console.log('[CD Dev] Edit source files to see changes instantly')
			})

			script.onerror = () => {
				console.error('[CD Dev] Failed to load script')
			}

			document.head.append(script)
		})
		.catch(error => {
			console.error('[CD Dev] Failed to fetch script:', error)
			console.error('[CD Dev] Make sure dev server is running (npm start)')
		})
})()
