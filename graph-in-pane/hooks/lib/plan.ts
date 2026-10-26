import type { PlanState } from '../../types'

/** The id of the plan section in the system prompt. */
export const PLAN_SECTION_ID = 'graph-in-pane:plan'

/** The system-prompt text that asks Claude to keep the plan graph up to date. */
export const PLAN_TEXT =
  'graph-in-pane: a planning conversation is active. Keep a top-down box-and-arrow picture of the plan under discussion in the user\'s side pane: call mcp__graph-in-pane__show_graph with kind "plan", a short title and a Graphviz digraph (no styling; the pane styles it). The tool only draws in the pane and changes no files, so it is allowed in plan mode. Call it as soon as the plan has a shape (in plan mode, before ExitPlanMode), and again when its boxes or arrows change, not every turn. Keep it under about 15 nodes with labels of a few words.'

/** What can start or end a planning conversation. */
export type PlanEvent =
  | { type: 'skill' }
  | { type: 'enterPlanTool' }
  | { type: 'exitPlanTool' }
  | { type: 'permissionMode'; mode: string | undefined }
  | { type: 'clear' }
  | { type: 'off' }

/**
 * Whether a skill starts a planning conversation.
 * @param {string} skill the skill name, possibly `plugin:skill`
 * @returns {boolean} true for brainstorming and writing-plans
 */
export const isPlanningSkill = (skill: string): boolean => /(^|:)(brainstorming|writing-plans)$/.test(skill)

const on = (state: PlanState, source: 'skill' | 'planmode'): PlanState => ({ ...state, active: true, source })
const off = (state: PlanState): PlanState => ({ ...state, active: false, source: null })

/**
 * When the plan section is in the system prompt; `latest` is kept throughout.
 * @param {PlanState} state the current plan state
 * @param {PlanEvent} event what happened
 * @returns {PlanState} the next state
 */
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
