declare global {
	type Constructor<T = any> = new (...arguments_: any[]) => T
	type AtLeastOne<T> = [T, ...T[]]
	type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>
	type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
	type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never
	// type ExpandRecursively<T> = T extends object
	//   ? T extends infer O ? { [K in keyof O]: ExpandRecursively<O[K]> } : never
	//   : T;
	type ValueOf<T> = Expand<T[keyof T]>
	type RemoveMethods<T> = {
		[K in keyof T as T[K] extends AnyFunction ? never : K]: T[K]
	}
	type AreTypesEqual<T, U> = T extends U ? (U extends T ? true : false) : false

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

	type MixinType<Mixin extends Constructor> = {
		new (...args: any[]): InstanceType<Mixin>
		prototype: InstanceType<Mixin>
	}
}

export {}
