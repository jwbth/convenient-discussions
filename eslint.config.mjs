import stylistic from '@stylistic/eslint-plugin'

export default [
	{
		ignores: ['backups/**', 'dist/**', 'misc/**', '*.json5', '*.jsonc', 'config/**/*', 'src/tribute/**', 'sandbox/**'],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: false,
		},
		plugins: { '@stylistic': stylistic },
		rules: {
			'@stylistic/semi': ['error', 'never', {
				beforeStatementContinuationChars: 'always',
			}],
		},
	},
]
