export type RecoveryDecision = 'recover' | 'accept';

/**
 * A model asking to fail is a hypothesis, not a verdict. Most of the time it means
 * the agent looked at one viewport, missed something, and gave up. The gate spends
 * one iteration proving the page really lacks the element before the run dies.
 */
export class RecoveryGate {
    private attempts = new Map<string, number>();

    consider(stepName: string): RecoveryDecision {
        const used = this.attempts.get(stepName) || 0;
        this.attempts.set(stepName, used + 1);
        return used === 0 ? 'recover' : 'accept';
    }

    resetForStep(stepName: string) {
        this.attempts.delete(stepName);
    }

    usedAttempts(stepName: string): number {
        return this.attempts.get(stepName) || 0;
    }

    buildPrompt(reason: string | undefined, inventory: string): string {
        return `RECOVERY CHECK: you asked to fail because "${reason || 'no reason given'}".
Below is every element found by scrolling the whole page and merging each scroll
position. It carries no coordinates on purpose, act with the selectors.
${inventory}
Either act on something in this inventory, or return fail again and cite the evidence
that proves the element cannot exist, for example an empty state message or an entry in
page.alerts. If the goal names an element that this page never had, say so plainly.
Do not repeat your previous reasoning without checking this list first.`;
    }
}
