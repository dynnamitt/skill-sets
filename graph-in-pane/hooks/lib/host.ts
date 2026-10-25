import type { EngineInterface, ProcessRunInit, ProcessRunResult } from 'claude-code'

/** The environment variables the mod reads; `$.env.get` takes literal names. */
export type EnvName = 'HOME' | 'XDG_CACHE_HOME' | 'XDG_DATA_HOME'

/** The slice of the engine the lib modules use, so tests can hand in a fake. */
export type Host = {
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  exists: (path: string) => Promise<boolean>
  env: (name: EnvName) => Promise<string | undefined>
}

// A function declaration: the engine follows `$` past an import only into one.
export function hostOf($: EngineInterface): Host {
  return {
    run: (argv, init) => $.process.run(argv, init),
    exists: path => $.fs.exists(path),
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
