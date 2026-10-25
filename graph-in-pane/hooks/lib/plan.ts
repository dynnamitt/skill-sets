import type { PlanState } from '../../types'

export const PLAN_SECTION_ID = 'graph-in-pane:plan'

export const PLAN_TEXT =
  'graph-in-pane: a planning conversation is active. Keep a top-down box-and-arrow picture of the plan under discussion in the user\'s side pane: call mcp__graph-in-pane__show_graph with kind "plan", a short title and a Graphviz digraph (no styling; the pane styles it). Call it when the plan\'s boxes or arrows change, not every turn. Keep it under about 15 nodes with labels of a few words.'

export type PlanEvent =
  | { type: 'skill' }
  | { type: 'enterPlanTool' }
  | { type: 'exitPlanTool' }
  | { type: 'permissionMode'; mode: string | undefined }
  | { type: 'clear' }
  | { type: 'off' }

export const isPlanningSkill = (skill: string): boolean => /(^|:)(brainstorming|writing-plans)$/.test(skill)

const on = (state: PlanState, source: 'skill' | 'planmode'): PlanState => ({ ...state, active: true, source })
const off = (state: PlanState): PlanState => ({ ...state, active: false, source: null })

/** When the plan section is in the system prompt; `latest` is kept throughout. */
export const planTransition = (state: PlanState, event: PlanEvent): PlanState => {
  switch (event.type) {
    case 'skill':
      return on(state, 'skill')
    case 'enterPlanTool':
      return on(state, 'planmode')
    case 'exitPlanTool':
      return state.source === 'planmode' ? off(state) : state
    case 'permissionMode':
      return event.mode === 'plan'
        ? state.active
          ? state
          : on(state, 'planmode')
        : state.source === 'planmode'
          ? off(state)
          : state
    case 'clear':
    case 'off':
      return off(state)
  }
}
