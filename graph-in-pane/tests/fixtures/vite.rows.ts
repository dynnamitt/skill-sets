// Recorded with ast-grep 0.51.0 from vite/vite.config.ts (rules in hooks/lib/rules.ts), ast-grep JSON trimmed.
export const ROWS = [
  {"ruleId": "import", "text": "import { defineConfig } from 'vite'", "range": {"start": {"line": 0, "column": 0}, "end": {"line": 0, "column": 35}}},
  {"ruleId": "import", "text": "import react from '@vitejs/plugin-react'", "range": {"start": {"line": 1, "column": 0}, "end": {"line": 1, "column": 40}}},
  {"ruleId": "import", "text": "import { banner } from './build/banner'", "range": {"start": {"line": 2, "column": 0}, "end": {"line": 2, "column": 39}}},
  {"ruleId": "fn", "text": "function helper(x: string) { return banner(x) }", "range": {"start": {"line": 3, "column": 0}, "end": {"line": 3, "column": 47}}},
  {"ruleId": "fn", "text": "mk = (n: number) => helper(String(n))", "range": {"start": {"line": 4, "column": 6}, "end": {"line": 4, "column": 43}}},
  {"ruleId": "call", "text": "banner(x)", "range": {"start": {"line": 3, "column": 36}, "end": {"line": 3, "column": 45}}},
  {"ruleId": "call", "text": "helper(String(n))", "range": {"start": {"line": 4, "column": 26}, "end": {"line": 4, "column": 43}}},
  {"ruleId": "call", "text": "String(n)", "range": {"start": {"line": 4, "column": 33}, "end": {"line": 4, "column": 42}}},
  {"ruleId": "call", "text": "defineConfig({ plugins: [react(), banner('hi')], build: { outDir: mk(1) } })", "range": {"start": {"line": 5, "column": 15}, "end": {"line": 5, "column": 91}}},
  {"ruleId": "call", "text": "react()", "range": {"start": {"line": 5, "column": 40}, "end": {"line": 5, "column": 47}}},
  {"ruleId": "call", "text": "banner('hi')", "range": {"start": {"line": 5, "column": 49}, "end": {"line": 5, "column": 61}}},
  {"ruleId": "call", "text": "mk(1)", "range": {"start": {"line": 5, "column": 81}, "end": {"line": 5, "column": 86}}},
]
