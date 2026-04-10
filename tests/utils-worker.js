export async function parseCode(code, customOptions) {
	const defaultOptions = {
		action: 'parse',
		text: code,
		contentmodel: 'wikitext',
		prop: ['text'],
		pst: true,
		disabletoc: true,
		disablelimitreport: true,
		disableeditsection: true,
		preview: true,
	}

	const response = await new mw.Api({
		parameters: {
			formatversion: 2,
			uselang: 'en',
		},
	}).post({ ...defaultOptions, ...customOptions })

	return response.parse.text
}
