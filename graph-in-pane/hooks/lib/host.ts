import type { EngineInterface, FsEntry, ProcessRunInit, ProcessRunResult } from 'claude-code'

/** The environment variables the mod reads; `$.env.get` takes literal names. */
export type EnvName = 'HOME' | 'XDG_CACHE_HOME' | 'XDG_DATA_HOME'

/** The slice of the engine the lib modules use, so tests can hand in a fake. */
export type Host = {
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  exists: (path: string) => Promise<boolean>
  env: (name: EnvName) => Promise<string | undefined>
  list: (dir: string) => Promise<readonly FsEntry[]>
  read: (path: string) => Promise<string>
  /** A file's bytes, base64. */
  bytes: (path: string) => Promise<string>
  /** null when the path does not exist. */
  stat: (path: string) => Promise<{ kind: 'file' | 'dir' | 'other'; mtimeMs: number } | null>
}

// A function declaration: the engine follows `$` past an import only into one.
export function hostOf($: EngineInterface): Host {
  return {
    run: (argv, init) => $.process.run(argv, init),
    exists: path => $.fs.exists(path),
    list: dir => $.fs.list(dir),
    read: path => $.fs.read(path),
    bytes: async path => (await $.fs.read(path, { as: 'bytes' })).base64,
    stat: async path => {
      const stat = await $.fs.stat(path).catch(() => null)
      return stat === null ? null : { kind: stat.kind, mtimeMs: stat.mtimeMs }
    },
    env: name =>
      name === 'HOME'
        ? $.env.get('HOME')
        : name === 'XDG_CACHE_HOME'
          ? $.env.get('XDG_CACHE_HOME')
          : $.env.get('XDG_DATA_HOME'),
  }
}

const RESULT = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

/** A process result, for fakes. */
export const ran = (exitCode: number, stdout = '', stderr = ''): ProcessRunResult => ({
  ...RESULT,
  exitCode,
  stdout,
  stderr,
})

/** The message of anything thrown. */
export const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Runs `work`; a rejection becomes `onError(message)` instead of escaping a hook. */
export const safely = async <T>(work: () => Promise<T>, onError: (message: string) => T): Promise<T> => {
  try {
    return await work()
  } catch (err) {
    return onError(messageOf(err))
  }
}

/**
 * Maps `items` through `fn` with at most `limit` calls in flight; results keep input order.
 * @param {readonly T[]} items the inputs
 * @param {number} limit the most calls running at once
 * @param {(item: T) => Promise<R>} fn the async mapper
 * @returns {Promise<R[]>} the results, in input order
 */
export const mapLimit = async <T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i] as T)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
