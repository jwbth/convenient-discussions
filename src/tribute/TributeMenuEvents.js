class TributeMenuEvents {
	/**
	 * @param {import('./Tribute').default} tribute
	 */
	constructor(tribute) {
		this.tribute = tribute
	}

	bind() {
		this.menuContainerScrollEvent = this.debounce(
			() => {
				if (this.tribute.isActive) {
					this.tribute.showMenuFor(this.tribute.current.element, false)
				}
			},
			300,
			false,
		)
		this.windowResizeEvent = this.debounce(
			() => {
				if (this.tribute.isActive) {
					this.tribute.range.positionMenuAtCaret(true)
				}
			},
			300,
			false,
		)

		document.addEventListener('click', this.tribute.events.click)
		document.addEventListener('mousedown', this.tribute.events.mousedown)
		window.addEventListener('resize', this.windowResizeEvent)

		// jwbth: Added this line to make the menu change its height if its lower border is off screen.
		window.addEventListener('viewportMove', this.windowResizeEvent)

		if (this.tribute.menuContainer) {
			this.tribute.menuContainer.addEventListener(
				'viewportMove',
				this.menuContainerScrollEvent,
				false,
			)
		} else {
			window.addEventListener('viewportMove', this.menuContainerScrollEvent)
		}
	}

	unbind() {
		document.removeEventListener('click', this.tribute.events.click)
		document.removeEventListener('mousedown', this.tribute.events.mousedown)
		window.removeEventListener('resize', this.windowResizeEvent)

		// jwbth: Added this line, see above.
		window.removeEventListener('viewportMove', this.windowResizeEvent)

		if (this.tribute.menuContainer) {
			this.tribute.menuContainer.removeEventListener(
				'viewportMove',
				this.menuContainerScrollEvent,
				false,
			)
		} else {
			window.removeEventListener('viewportMove', this.menuContainerScrollEvent)
		}
	}

	/**
	 * @param {() => void} func
	 * @param {number} wait
	 * @param {boolean} immediate
	 * @returns {() => void}
	 */
	debounce(func, wait, immediate) {
		/**
		 * @type {number | null}
		 */
		let timeout
		return () => {
			let context = this
			let args = arguments
			let later = () => {
				timeout = null
				if (!immediate) func.apply(context, args)
			}
			let callNow = immediate && !timeout
			clearTimeout(timeout)
			timeout = setTimeout(later, wait)
			if (callNow) func.apply(context, args)
		}
	}
}

export default TributeMenuEvents
