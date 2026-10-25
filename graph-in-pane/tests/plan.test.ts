import { expect, test } from 'claude-code/testing'

import { isPlanningSkill, PLAN_SECTION_ID, planTransition } from '../hooks/lib/plan'
import type { PlanState } from '../types'
import { world } from './world'

type $T = Parameters<Parameters<typeof test>[1]>[0]
type OnT = Parameters<Parameters<typeof test>[1]>[1]

const OFF: PlanState = { active: false, source: null, latest: null }
const SKILL: PlanState = { active: true, source: 'skill', latest: null }
const PLANMODE: PlanState = { active: true, source: 'planmode', latest: null }

test('planning skills are recognised with or without their plugin', async () => {
  expect(['superpowers:brainstorming', 'brainstorming', 'writing-plans', 'commit'].map(isPlanningSkill)).toEqual([
    true, true, true, false,
  ])
})

test('the transitions switch planning on and off', async () => {
  expect(planTransition(OFF, { type: 'skill' })).toEqual(SKILL)
  expect(planTransition(OFF, { type: 'enterPlanTool' })).toEqual(PLANMODE)
  expect(planTransition(OFF, { type: 'permissionMode', mode: 'plan' })).toEqual(PLANMODE)
  expect(planTransition(PLANMODE, { type: 'exitPlanTool' })).toEqual(OFF)
  expect(planTransition(PLANMODE, { type: 'permissionMode', mode: 'default' })).toEqual(OFF)
  expect(planTransition(SKILL, { type: 'permissionMode', mode: 'default' })).toEqual(SKILL)
  expect(planTransition(SKILL, { type: 'clear' })).toEqual(OFF)
  expect(planTransition(SKILL, { type: 'off' })).toEqual(OFF)
})

test('the latest plan graph survives every transition', async () => {
  const latest = { title: 'plan' } as unknown as PlanState['latest']
  expect(planTransition({ ...SKILL, latest }, { type: 'off' }).latest).toBe(latest)
})

const compose = async ($: $T) =>
  $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: { name: 'default', isKeepingCodingInstructions: true }, traits: [] } as never)

const base = (on: OnT) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
}

const start = async ($: $T) => $.session.start({ cwd: '/fx', surface: 'terminal', isInteractive: true })

test('outside planning the system prompt is unchanged', async ($, on) => {
  world(on, {})
  base(on)
  await start($)
  const { sections } = await compose($)
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('a planning skill adds the plan-graph section last', async ($, on) => {
  world(on, {})
  base(on)
  await start($)
  await $.skill.prompt({ skill: 'writing-plans', text: 'Write the plan.', frontmatter: {}, source: 'plugin' } as never)
  const { sections } = await compose($)
  expect(sections[sections.length - 1]).toEqual(expect.objectContaining({ id: PLAN_SECTION_ID, scope: 'session' }))
})

test('/graph off removes the section again', async ($, on) => {
  world(on, {})
  base(on)
  await start($)
  await $.skill.prompt({ skill: 'superpowers:brainstorming', text: 'Brainstorm.', frontmatter: {}, source: 'plugin' } as never)
  await $.command.run({ command: 'graph', args: 'off' })
  const { sections } = await compose($)
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('plan mode from shift+tab switches planning on', async ($, on) => {
  world(on, {})
  base(on)
  await start($)
  await $.classic.UserPromptSubmit({ prompt: 'plan this', permission_mode: 'plan' } as never)
  const { sections } = await compose($)
  expect(sections.map(s => s.id)).toContain(PLAN_SECTION_ID)
})
