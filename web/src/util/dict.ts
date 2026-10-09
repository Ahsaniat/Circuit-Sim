/**
 * A prototype-free lookup table.
 *
 * Tables keyed by user text must not inherit from Object.prototype:
 * `TABLE['constructor']` on a plain object returns a function instead of
 * undefined, so unknown component types, ids and names would reach the
 * prototype chain and produce wrong behaviour. These dictionaries treat
 * every string, including `__proto__` and `constructor`, as a plain key.
 */
export function dict<T>(entries: Record<string, T>): Record<string, T> {
    return Object.assign(Object.create(null) as Record<string, T>, entries);
}
