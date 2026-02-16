global.OO = {
	EventEmitter: class EventEmitter {
		on() {
			return this
		}
		once() {
			return this
		}
		off() {
			return this
		}
		emit() {
			return true
		}
		emitThrow() {
			return true
		}
		connect() {
			return this
		}
		disconnect() {
			return this
		}
	},
	initClass: () => {},
	mixinClass: () => {},
}
