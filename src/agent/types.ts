export type ActionType = 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'navigate' | 'hover' | 'keypress' | 'rage_click' | 'done' | 'fail';

export interface Action {
    type: ActionType;
    selector?: string;
    // For type: the text to enter. For select: the option value or visible label.
    text?: string;
    coordinate?: { x: number; y: number };
    duration?: number;
    reason?: string;
    intent?: string;  // For heuristic element search (e.g., "login", "submit")
    key?: string;     // For keypress action (e.g., "Enter", "Escape", "Tab")
}

export interface TestStep {
    name: string; // e.g., "Login"
    goal: string; // e.g., "Login with user demo"
}

export interface TestFlow {
    name: string;
    steps: TestStep[];
}

export interface ChaosProfile {
    name: 'standard' | 'gremlin' | 'hacker';
    latency?: { min: number; max: number; chance: number };
    packetLoss?: number; // 0.0 to 1.0
    injection?: boolean; // SQLi, XSS
    rageClick?: boolean; // Rapid clicking
}
