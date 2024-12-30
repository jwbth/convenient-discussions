type Constructor = new (...args: any[]) => object;
type AtLeastOne<T> = [T, ...T[]];
type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
