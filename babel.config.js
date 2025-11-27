// babel.config.js
module.exports = {
	presets: [
		['@babel/preset-env', {
			bugfixes: true,
			// Don't use useBuiltIns since we're manually importing specific polyfills
		}],
	],
	plugins: [
		'@babel/plugin-transform-numeric-separator',
		'@babel/plugin-transform-class-properties',
		'@babel/plugin-transform-class-static-block',
		'@babel/plugin-transform-logical-assignment-operators',
		'@babel/plugin-transform-nullish-coalescing-operator',
		'@babel/plugin-transform-optional-catch-binding',
		'@babel/plugin-transform-optional-chaining',
		'@babel/plugin-transform-runtime',
		'@babel/plugin-transform-typescript',
	],
}
