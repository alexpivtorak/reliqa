// A step gets one vision iteration per model call, so the cap on iterations is
// also the cap on how many actions a step can ever perform. A flat cap kills
// long generated plans halfway through.

export const DEFAULT_STEP_BUDGET = 25;
export const CHAOS_STEP_BUDGET = 50;
export const MAX_STEP_BUDGET = 120;

// Retries, dialogs and the occasional scroll cost extra iterations
const RETRY_FACTOR = 1.5;
const DETOUR_HEADROOM = 10;

// Matches numbered instructions like "1. Visit the URL /." or "  12. Click on X"
const NUMBERED_STEP = /^[ \t]*\d+\.[ \t]+\S/;

export function countPlannedSteps(goal: string): number {
    if (!goal) return 0;

    return goal
        .split('\n')
        .filter(line => NUMBERED_STEP.test(line))
        .length;
}

export function getStepBudget(goal: string, mode?: string): number {
    const plannedSteps = countPlannedSteps(goal);

    // A plain one line goal carries no numbering, so keep the old behaviour
    let budget = plannedSteps === 0
        ? DEFAULT_STEP_BUDGET
        : Math.ceil(plannedSteps * RETRY_FACTOR) + DETOUR_HEADROOM;

    if (mode === 'chaos') {
        budget = Math.max(budget, CHAOS_STEP_BUDGET);
    }

    return Math.min(Math.max(budget, DEFAULT_STEP_BUDGET), MAX_STEP_BUDGET);
}
