import stylistic from '@stylistic/eslint-plugin';

export default [
	{
		ignores: ['dist/**', 'misc/**', '*.json5', '*.jsonc', 'config/**/*', 'src/tribute/**', 'sandbox/**'],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: false,
		},
		plugins: { '@stylistic': stylistic },
		rules: {
			'@stylistic/indent': ['error', 'tab', {
				SwitchCase: 1,
				offsetTernaryExpressions: true,
			}],
		},
	},
];
