import type { Lang } from './skeleton'

// ast-grep inline rules, verified against ast-grep 0.51 on ble-pair.sh and a
// Vite config. Bash patterns like `$NAME() { $$$ }` do not parse: match kinds.
const BASH = `id: fn
language: bash
rule: { kind: function_definition }
---
id: cmd
language: bash
rule: { kind: command_name }
---
id: exit
language: bash
rule: { kind: command, has: { kind: command_name, regex: "^exit$" } }
---
id: source
language: bash
rule: { kind: command, has: { kind: command_name, regex: "^(source|\\\\.)$" } }`

const script = (language: string): string => `id: fn
language: ${language}
rule: { any: [ { kind: function_declaration }, { kind: variable_declarator, has: { field: value, kind: arrow_function } } ] }
---
id: call
language: ${language}
rule: { kind: call_expression }
---
id: import
language: ${language}
rule: { kind: import_statement }`

export const RULES: Readonly<Record<Lang, string>> = {
  bash: BASH,
  typescript: script('typescript'),
  tsx: script('tsx'),
  javascript: script('javascript'),
}
