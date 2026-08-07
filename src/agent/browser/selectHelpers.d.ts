export function resolveWidgetKindInPage(el: Element): 'select' | 'combobox' | 'listbox' | 'unknown';

export function readTriggerState(el: Element): string;

export function readTagAndRole(el: Element): {
    tag: string;
    role: string;
    expanded: string | null;
    controls: string;
};

export function matchNativeOptions(
    el: Element,
    target: string
): {
    match: { value: string; label: string } | null;
    closest: string[];
};

export function labelMatchesSelected(el: Element, target: string): boolean;

export function findAriaOptionMatch(target: string): {
    index: number;
    text: string;
    testId: string;
    closest: string[];
};

export function clickAriaOption(target: string | { text?: string; testId?: string }): string | null;

export function pageHoldsChoice(target: string): boolean;
