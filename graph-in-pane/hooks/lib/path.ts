/**
 * Collapses `.` and `..` segments and empty parts of an absolute path.
 * @param {string} path an absolute path, possibly with `.`, `..` or `//`
 * @returns {string} the cleaned absolute path
 */
export const normalize = (path: string): string =>
  `/${path
    .split('/')
    .reduce<string[]>(
      (parts, part) =>
        part === '' || part === '.' ? parts : part === '..' ? parts.slice(0, -1) : [...parts, part],
      [],
    )
    .join('/')}`

/**
 * The directory part of a path; `/` for a root child.
 * @param {string} path
 * @returns {string} everything before the last slash
 */
export const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/'))) || '/'

/**
 * The last path segment, ignoring a trailing slash.
 * @param {string} path
 * @returns {string} the final non-empty segment, else the path itself
 */
export const base = (path: string): string => path.split('/').filter(Boolean).pop() ?? path
