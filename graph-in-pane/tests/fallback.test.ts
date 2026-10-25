import { expect, test } from 'claude-code/testing'

import { extractFile, isFailure } from '../hooks/lib/extract'
import { parserDirsFrom, sexpToRows } from '../hooks/lib/fallback'
import { fileSkeleton, toRows } from '../hooks/lib/skeleton'
import { ROWS as PAIR_ROWS } from './fixtures/pair.rows'
import { SEXP as PAIR_SEXP, SOURCE as PAIR_SOURCE } from './fixtures/pair.sexp'
import { ROWS as VITE_ROWS } from './fixtures/vite.rows'
import { SEXP as VITE_SEXP, SOURCE as VITE_SOURCE } from './fixtures/vite.sexp'

const resolve = (spec: string) => (spec.startsWith('./') ? `/fx/${spec.slice(2)}` : null)

test('bash: the tree-sitter CLI gives the same skeleton as ast-grep', async () => {
  expect(fileSkeleton('/fx/pair.sh', 'bash', sexpToRows(PAIR_SEXP, PAIR_SOURCE, 'bash'), resolve)).toEqual(
    fileSkeleton('/fx/pair.sh', 'bash', toRows(PAIR_ROWS), resolve),
  )
})

test('typescript: the tree-sitter CLI gives the same skeleton as ast-grep', async () => {
  const file = '/fx/vite/vite.config.ts'
  expect(fileSkeleton(file, 'typescript', sexpToRows(VITE_SEXP, VITE_SOURCE, 'typescript'), resolve)).toEqual(
    fileSkeleton(file, 'typescript', toRows(VITE_ROWS), resolve),
  )
})

test('parser dirs: the option first, then what nvim reports, then the XDG defaults', async () => {
  expect(
    parserDirsFrom({
      option: '/opt/parsers',
      nvimFiles: '/home/u/.local/share/nvim/site/parser/bash.so\n/home/u/.local/share/nvim/site/parser/lua.so\n',
      dataHome: '/home/u/.local/share',
    }),
  ).toEqual([
    '/opt/parsers',
    '/home/u/.local/share/nvim/site/parser',
    '/home/u/.local/share/nvim/lazy/nvim-treesitter/parser',
  ])
})

test('without ast-grep, extraction falls back to tree-sitter and an nvim parser', async () => {
  const argvs: string[][] = []
  const host = {
    run: async (argv: readonly string[]) => {
      argvs.push([...argv])
      return { exitCode: 0, stdout: PAIR_SEXP, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    },
    exists: async (path: string) => path === '/parsers/bash.so',
    env: async () => undefined,
    list: async () => [],
    read: async () => PAIR_SOURCE,
    bytes: async () => '',
    stat: async () => null,
  }
  const sk = await extractFile(host, { 'tree-sitter': '/usr/bin/tree-sitter' }, '/fx/pair.sh', 'bash', ['/parsers'])
  expect(isFailure(sk) ? sk.error : sk.fns.map(fn => fn.name)).toEqual(['scan', 'pick'])
  expect(argvs[0]).toEqual(['/usr/bin/tree-sitter', 'parse', '--lib-path', '/parsers/bash.so', '--lang-name', 'bash', '/fx/pair.sh'])
})
