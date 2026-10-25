import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { banner } from './build/banner'
function helper(x: string) { return banner(x) }
const mk = (n: number) => helper(String(n))
export default defineConfig({ plugins: [react(), banner('hi')], build: { outDir: mk(1) } })
