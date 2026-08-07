import { Action } from './types.js';

export class Optimizer {
    /**
     * Optimizes a sequence of actions by removing redundancies and "panic" behaviors.
     * @param actions The raw list of actions recorded during the session
     * @returns A clean list of actions suitable for caching
     */
    static optimizeActions(actions: Action[]): Action[] {
        if (!actions || actions.length === 0) return [];

        const optimized: Action[] = [];
        let droppedCount = 0;

        for (let i = 0; i < actions.length; i++) {
            const current = actions[i];
            const next = actions[i + 1];

            // 1. Remove 'wait' actions entirely (unless it's the ONLY action, potentially)
            // We want the creating agent to rely on smart waiting, not hardcoded pauses from a flaky run.
            // Exception: If the user explicitly requested a wait (rare in auto-execution), but generally for cache we strip them.
            if (current.type === 'wait') {
                droppedCount++;
                continue;
            }

            // 2. Remove 'fail' actions - we only want the successful path
            if (current.type === 'fail') {
                droppedCount++;
                continue;
            }

            // 3. Deduplicate consecutive identical actions (The "ReliReli" fix)
            // If the next action is IDENTICAL to the current one, skip the current one (keep the last one)
            // We compare type and key parameters (selector, text, coordinate)
            if (next && this.areActionsIdentical(current, next)) {
                // If it's a TYPE action, we definitely want to deduplicate (typing same thing twice)
                // If it's a CLICK action, we might want to be careful (e.g. clicking "Next" twice), 
                // but usually the specific "Panic Loop" has identical targets without navigation in between.
                // Since this optimizer is run on the *batch* before caching, and cache is per-step, 
                // it's statistically likely to be a panic loop if it's identical.

                // For 'type' and 'select' actions: Always dedupe (keep the last one which likely succeeded)
                if (current.type === 'type' || current.type === 'select') {
                    droppedCount++;
                    continue;
                }

                // For 'click' actions: Dedupe if it's the exact same selector/coordinate
                if (current.type === 'click') {
                    droppedCount++;
                    continue;
                }
            }

            optimized.push(current);
        }

        if (droppedCount > 0) {
            console.log(`[Optimizer] 🧹 Reduced path from ${actions.length} to ${optimized.length} steps (-${droppedCount})`);
        }

        return optimized;
    }

    private static areActionsIdentical(a: Action, b: Action): boolean {
        if (a.type !== b.type) return false;

        // Compare relevant fields based on type
        if (a.type === 'type' || a.type === 'select') {
            return a.selector === b.selector && a.text === b.text;
        }

        if (a.type === 'click') {
            // If selectors match, it's the same
            if (a.selector && b.selector && a.selector === b.selector) return true;
            // If coordinates match exactly (rare for humans, common for bots/loops)
            if (a.coordinate && b.coordinate &&
                a.coordinate.x === b.coordinate.x &&
                a.coordinate.y === b.coordinate.y) return true;
        }

        return false;
    }
}
