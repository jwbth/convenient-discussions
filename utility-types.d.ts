import type yargs from 'yargs'

declare global {
	type YargsNonAwaited = Exclude<ReturnType<typeof yargs>['argv'], Promise<any>>

	/**
	 * Creates a function type with N string parameters returning a string
	 *
	 * @example
	 * type Callback0 = ReplaceCallback<0>; // () => string
	 * type Callback2 = ReplaceCallback<2>; // (arg0: string, arg1: string) => string
	 * type Callback5 = ReplaceCallback<5>; // (arg0: string, arg1: string, arg2: string, arg3: string, arg4: string) => string
	 */
	type ReplaceCallback<N extends number = number> = number extends N
		? (...args: string[]) => string
		: (...args: StringTuple<AddOne<N>>) => string

	/**
	 * Creates a tuple of N string types
	 */
	type StringTuple<N extends number, T extends readonly string[] = []> = T['length'] extends N
		? T
		: StringTuple<N, readonly [...T, string]>

	/**
	 * Adds 1 to a numeric type
	 */
	type AddOne<N extends number> = [...StringTuple<N>, unknown]['length']

	type DeepPartial<T> = {
		[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
	}

	type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never
}

export {}
