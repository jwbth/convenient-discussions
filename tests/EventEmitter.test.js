import { describe, test, expect } from 'vitest'

import EventEmitter from '../src/EventEmitter'

describe('EventEmitter', () => {
	test('calls a one-time listener only at the first emit', () => {
		const emitter = new EventEmitter()
		let calls = 0
		emitter.once('event', () => {
			calls++
		})

		emitter.emit('event')
		emitter.emit('event')

		expect(calls).toBe(1)
	})

	test('removes a listener added without a context', () => {
		const emitter = new EventEmitter()
		let calls = 0
		const listener = () => {
			calls++
		}
		emitter.on('event', listener)

		emitter.off('event', listener)
		emitter.emit('event')

		expect(calls).toBe(0)
	})
})
