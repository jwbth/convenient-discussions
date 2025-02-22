type Constructor = new (...args: any[]) => object;
type AtLeastOne<T> = [T, ...T[]];
type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
// type ExpandRecursively<T> = T extends object
//   ? T extends infer O ? { [K in keyof O]: ExpandRecursively<O[K]> } : never
//   : T;
type ValueOf<T> = Expand<T[keyof T]>;
type RemoveMethods<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K]
};
