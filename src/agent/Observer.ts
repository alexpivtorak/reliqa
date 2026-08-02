import { Action } from './types.js';

interface StateSnapshot {
    url: string;
    actionCount: number;
    lastAction?: Action;
    timestamp: number;
    hadStateChange: boolean;
}

export class Observer {
    private snapshots: StateSnapshot[] = [];
    private maxSnapshots = 25; // Keep last 25 states

    // On single page apps a dialog or panel can open without touching the URL.
    // Those actions are real progress, so only actions that changed nothing count as inert.
    private isInert(index: number, snapshots: StateSnapshot[]): boolean {
        const snapshot = snapshots[index];
        if (snapshot.hadStateChange) return false;
        const previous = snapshots[index - 1];
        if (previous && previous.url !== snapshot.url) return false;
        return true;
    }

    recordState(url: string, action?: Action, hadStateChange: boolean = false) {
        this.snapshots.push({
            url,
            actionCount: this.snapshots.length,
            lastAction: action,
            timestamp: Date.now(),
            hadStateChange
        });

        // Keep only recent snapshots
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }
    }

    /**
     * Validates if progress is being made
     * Returns null if OK, or an intervention message if stuck
     */
    validateProgress(): string | null {
        // Filter out 'wait' actions for progress validation
        // 'wait' is often used during rate-limiting/429s and shouldn't count as a "stuck" action
        const progressActions = this.snapshots.filter(s => s.lastAction?.type !== 'wait');

        if (progressActions.length < 3) return null;

        const current = progressActions[progressActions.length - 1];
        const previous = progressActions[progressActions.length - 2];
        const twoBefore = progressActions[progressActions.length - 3];

        // Check if we're filling a form (multiple 'type' actions on same page)
        const recentTypes = progressActions.slice(-5).filter(
            s => s.lastAction?.type === 'type'
        ).length;

        const isFillingForm = recentTypes >= 3 && current.url === previous.url;

        const inertCount = progressActions.filter((_, idx) => this.isInert(idx, progressActions)).length;

        // Check 1: 15+ actions that changed neither the URL nor the page state
        if (current.url === previous.url &&
            previous.url === twoBefore.url &&
            inertCount >= 15 &&
            !isFillingForm) {
            return "STUCK: 15 actions produced no page change. Possible infinite loop.";
        }

        // Check 2: Too many clicks that changed nothing (but allow form filling)
        const recentInertClicks = progressActions
            .slice(-15)
            .filter((snapshot, idx, window) => snapshot.lastAction?.type === 'click' && this.isInert(idx, window))
            .length;

        // Allow up to 12 clicks in a row (for quantity pickers, carousels)
        if (recentInertClicks >= 12 && current.url === previous.url && !isFillingForm) {
            return "LOOP: Multiple clicks without any page change. Consider typing or waiting.";
        }

        const currentAction = current.lastAction;
        if (!currentAction) return null;

        // Check 3: Repeating the same action (exact same type) multiple times
        // Allow up to 5 repetitions for clicks (e.g. quantity adjusters, carousels)
        if (currentAction.type === previous.lastAction?.type &&
            currentAction.type === twoBefore.lastAction?.type &&
            current.url === previous.url &&
            currentAction.type !== 'type') {

            // Calculate how many times in a row this action type happened without changing anything
            let repeatCount = 0;
            let inertRepeatCount = 0;
            const targets = new Set<string>();

            for (let i = progressActions.length - 1; i >= 0; i--) {
                const action = progressActions[i].lastAction;
                if (action && action.type === currentAction.type) {
                    repeatCount++;
                    if (this.isInert(i, progressActions)) inertRepeatCount++;
                    // Track unique targets (selectors or coordinates)
                    if (action.selector) targets.add(action.selector);
                    if (action.coordinate) targets.add(`${action.coordinate.x},${action.coordinate.y}`);
                } else {
                    break;
                }
            }

            // If it's a click loop, check if we are hitting the SAME target
            if (currentAction.type === 'click') {
                // If we are clicking different things (e.g. checkbox list, tabs), allow more
                // If we are clicking the EXACT same target 3 times with no effect, it's a loop
                const isSameTargetLoop = targets.size === 1 && inertRepeatCount >= 3;
                const isGeneralClickLoop = inertRepeatCount >= 15; // Hard limit for clicks that change nothing

                if (isSameTargetLoop) {
                    return `REPETITION: Clicking the same target ${inertRepeatCount} times without navigation or state change.`;
                }
                if (isGeneralClickLoop) {
                    return `LIMIT: 15+ clicks with no page change. The agent might be lost.`;
                }
            } else if (inertRepeatCount >= 5) {
                // For other actions (like scroll), allow up to 5
                return `REPETITION: Action (${currentAction.type}) repeated 5+ times with no effect.`;
            }
        }

        return null;
    }

    /**
     * Returns a soft warning if repetition is starting
     */
    getEarlyWarning(): string | null {
        if (this.snapshots.length < 2) return null;

        const last = this.snapshots[this.snapshots.length - 1];
        const prev = this.snapshots[this.snapshots.length - 2];

        if (last.lastAction?.type === 'click' &&
            prev.lastAction?.type === 'click' &&
            last.url === prev.url &&
            !last.hadStateChange) {

            // Check if same selector/coordinate
            const lastTarget = last.lastAction.selector || JSON.stringify(last.lastAction.coordinate);
            const prevTarget = prev.lastAction.selector || JSON.stringify(prev.lastAction.coordinate);

            if (lastTarget === prevTarget) {
                return `⚠️ Warning: You clicked the same target twice and the page didn't change. Try a different approach or verify the element state.`;
            }
        }

        return null;
    }

    /**
     * Validates if a step goal was achieved
     * For login: URL should change from /login to something else
     */
    validateStepCompletion(stepName: string, expectedUrlChange?: string): string | null {
        if (this.snapshots.length < 2) return null;

        const current = this.snapshots[this.snapshots.length - 1];
        const beforeStep = this.snapshots[0]; // URL when step started

        // Logic updated per user request: only enforce navigation if the goal explicitly mentions it.
        const goalImpliesNavigation = stepName.toLowerCase().includes("go to") ||
            stepName.toLowerCase().includes("navigate");

        if (goalImpliesNavigation && current.url === beforeStep.url) {
            return `STEP_FAILED: "${stepName}" did not result in navigation. Still on ${current.url}`;
        }

        return null;
    }

    /**
     * Resets observer state (call at the start of each new step)
     */
    resetForNewStep() {
        this.snapshots = [];
    }

    getCurrentUrl(): string | null {
        if (this.snapshots.length === 0) return null;
        return this.snapshots[this.snapshots.length - 1].url;
    }

    getInitialUrl(): string | null {
        if (this.snapshots.length === 0) return null;
        return this.snapshots[0].url;
    }
}
