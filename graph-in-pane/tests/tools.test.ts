import { expect, test } from 'claude-code/testing'

import { type Host, ran } from '../hooks/lib/host'
import { candidateDirs, installHint, resolveTools } from '../hooks/lib/tools'

test('arch gets pacman for ast-grep', async () => {
  expect(installHint('ID=arch\n', false, 'ast-grep')).toContain('pacman -S ast-grep')
})

test('bazzite with brew gets brew for graphviz', async () => {
  expect(installHint('ID=bazzite\nID_LIKE="fedora"\n', true, 'dot')).toContain(
    'brew install graphviz',
  )
})

test('ubuntu gets cargo or npm for ast-grep', async () => {
  const hint = installHint('ID=ubuntu\nID_LIKE=debian\n', false, 'ast-grep')
  expect(hint).toContain('cargo install ast-grep')
  expect(hint).toContain('npm i -g @ast-grep/cli')
})

test('ubuntu gets apt for graphviz', async () => {
  expect(installHint('ID=ubuntu\nID_LIKE=debian\n', false, 'dot')).toContain(
    'apt install graphviz',
  )
})

test('candidate dirs cover brew, cargo and local bins', async () => {
  expect(candidateDirs('/home/u')).toEqual([
    '/home/linuxbrew/.linuxbrew/bin',
    '/home/u/.linuxbrew/bin',
    '/home/u/.cargo/bin',
    '/home/u/.local/bin',
  ])
})

const fakeHost = (onPath: Record<string, string>, files: readonly string[], log: string[] = []): Host => ({
  run: async argv => {
    log.push(argv.join(' '))
    const name = (argv[2] ?? '').replace('command -v ', '')
    return name in onPath ? ran(0, `${onPath[name]}\n`) : ran(1)
  },
  exists: async path => files.includes(path),
  env: async name => (name === 'HOME' ? '/home/u' : undefined),
  list: async () => [],
  read: async () => '',
  bytes: async () => '',
})

test('a tool on PATH is found with command -v', async () => {
  expect(await resolveTools(fakeHost({ dot: '/usr/bin/dot' }, []), {})).toEqual({ dot: '/usr/bin/dot' })
})

test('an option path wins without running a process', async () => {
  const log: string[] = []
  const tools = await resolveTools(fakeHost({}, ['/opt/ag'], log), { astGrepPath: '/opt/ag' })
  expect(tools['ast-grep']).toBe('/opt/ag')
  expect(log.filter(line => line.includes('ast-grep'))).toEqual([])
})

test('a tool only in a candidate dir is found there', async () => {
  const tools = await resolveTools(fakeHost({}, ['/home/u/.cargo/bin/ast-grep']), {})
  expect(tools).toEqual({ 'ast-grep': '/home/u/.cargo/bin/ast-grep' })
})
