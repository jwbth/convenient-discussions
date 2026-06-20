import 'jquery'

declare module 'jquery' {
	namespace JQueryStatic {
		function cdMerge(...arrayOfJquery: (JQuery | undefined)[]): this
	}
}

export {}
