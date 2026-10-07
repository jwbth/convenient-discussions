declare module '*.less' {
	const resource: string
	export = resource
}

declare module '*.less?inline' {
	const resource: string
	export default resource
}

declare module '*.svg?raw' {
	const resource: string
	export default resource
}
