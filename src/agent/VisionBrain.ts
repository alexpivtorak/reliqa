import { GoogleGenerativeAI } from '@google/generative-ai';
import { Action } from './types.js';
import { testSteps } from '../db/schema.js';
import { db } from '../db/index.js';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';

dotenv.config();

// Redis Publisher for inter-process communication
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class VisionBrain {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey?: string, modelName?: string) {
        const key = apiKey || process.env.GOOGLE_API_KEY;
        if (!key) throw new Error('GOOGLE_API_KEY is required');
        this.genAI = new GoogleGenerativeAI(key);

        // Prioritize passed model, then env var, then default to 2.5-flash
        const selectedModel = modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        console.log(`🤖 VisionBrain initialized with model: ${selectedModel}`);
        this.model = this.genAI.getGenerativeModel({ model: selectedModel });
    }

    async decideAction(screenshot: Buffer, goal: string, history: string[], pageContext?: string | null, domDiff?: string, runId?: number): Promise<{ thought: string, actions: Action[] }> {
        const contextSection = pageContext ? `
      
      PAGE CONTEXT (Distilled DOM):
      The page context is provided as a compressed JSON list of interactive elements.
      - t: tag name (btn=button, inp=input, etc.)
      - c: [x, y] center coordinates (USE THESE for precise clicking)
      - txt: visible text or value
      - dt: test id value
      - da: which attribute holds it ("data-test" or "data-testid") — use this exact attribute name
      - s: ready-to-use CSS selector for the test id (COPY THIS when present)
      - l: label/aria-label/placeholder
      - id: element id
      - wk: widget kind for dropdowns — "select" (native), "combobox", or "listbox"
      - val: current value of a select or combobox (empty string means blank)
      - opts: [{ v, txt }] available options when known (v=value, txt=label). Cap applies on long lists.
      - optN: total option count (may be larger than opts.length when truncated)
      - exp: 1 when a combobox is expanded, 0 when collapsed. Closed comboboxes omit opts.
      - vp: 1 means the element is inside the viewport and visible in the screenshot
      - vp: 0 means the element exists on the page but is scrolled out of view.
            It has NO c coordinates. Act on it with its selector and the system
            scrolls it into view for you.
      - dy: how far out of view it is in pixels (negative = above, positive = below)
      - meta: w/h viewport size, scrollY, scrollHeight, moreAbove, moreBelow,
              offscreen (how many elements are out of view right now)
      - page: state of the page as a whole
        - url, title, headings: where you are
        - alerts: visible validation errors, toasts and inline field errors
        - rows / listItems: how many visible table rows and list items the main area has
        - requiredEmpty: how many visible required fields are still blank
        - emptyState: true when the main area says it has no items or no results
        - digest: the first part of the main content text
      
      ${pageContext}
      
      SELECTOR PRIORITY:
      1. Prefer field "s" from page context when present (already uses the correct data-test vs data-testid attribute)
      2. Otherwise id/name: #id, [name='value']
      3. Text/Label/ARIA: button:has-text('Login'), [aria-label='Search']
      4. Coordinate: { "coordinate": { "x": 123, "y": 456 } } (Use 'c' values from context ONLY as a fallback if no good CSS selector is available, e.g., in Shadow DOM or custom canvases)
      
      IMPORTANT: Always prefer providing a robust CSS selector over coordinates. Coordinates should be used as a fallback because selectors are more resilient to layout shifts and page resizing.
      NEVER rewrite data-testid as data-test (or the reverse). Match the attribute name from "da" / "s".

      DROPDOWNS AND SELECTS:
      1. NEVER click an element whose wk is "select". A native select opens a browser popup
         with nothing in the DOM. Use type="select" with the option value or label in "text".
      2. Prefer a value or label from opts. When optN is larger than opts.length the list
         was truncated, but the system still resolves exact and normalized matches.
      3. For wk "combobox" with no opts, still use type="select" with the label you want.
         The system opens the widget and picks the matching option for you.
      4. Do not use type="type" on a native select.

      VIEWPORT AND SCROLLING:
      1. The screenshot only shows the viewport. The page continues below when meta.moreBelow is true.
      2. NEVER click or type at a coordinate for an element you cannot see in the screenshot.
         Use its selector instead, or scroll until you can see it.
      3. If the field you need is missing from the screenshot but listed with vp 0,
         act on its selector right away. Do not scroll first, the system handles that.
      4. If a field is missing from the context entirely and meta.moreBelow or meta.moreAbove
         is true, scroll once and look again before concluding it does not exist.

      PAGE STATE:
      1. Read page.alerts before repeating an action. A validation error explains why
         nothing moved far better than guessing does.
      2. page.emptyState true means the list, table or cart on screen holds no data.
         A control that only exists once data exists is not a missing control. Go create
         the data first, then come back to this step.
      3. page.requiredEmpty above zero means required fields are still blank. Fill them
         before submitting, unless you are deliberately testing validation.
      4. page.rows and page.listItems tell you whether a list actually has content,
         which the screenshot alone can hide below the fold.
      ` : '';

        // Add DOM diff info if available
        const diffSection = domDiff ? `
      
      PAGE CHANGE DETECTION:
      ${domDiff}
      
      Use this to verify if your last action had an effect. If "No changes detected" after multiple clicks, try a different approach.
      ` : '';

        if (runId) {
            redis.publish('reliqa-events', JSON.stringify({ runId, type: 'thought', message: 'Analyzing page state...', timestamp: new Date() }));
        }

        const prompt = `
      You are an automated QA tester acting as a user. 
      Your Goal: "${goal}"
      
      History of actions:
      ${history.join('\n')}
${contextSection}${diffSection}
      Analyze the screenshot and context. Determine the next logical step.

      RETURN A JSON OBJECT WITH TWO PARTS: "thought" AND "action".
      
      1. THOUGHT PROCESS:
      - Analyze the current state (Where am I? What do I see?)
      - Evaluate previous action result (Did the page change? Did I fail?)
      - Formulate a plan (What needs to happen next?)
      - Select the best element (Prefer ID/Data-Test over Text over Coordinates)

      2. ACTION:
      {
        "thought": "I see a login form. The previous action clicked the 'Sign In' link. Now I need to enter the username. I see an input with id='email'.",
        "action": {
            "type": "click" | "type" | "select" | "keypress" | "scroll" | "hover" | "wait" | "navigate" | "done" | "fail",
            "reason": "short explanation for logs",
            "selector": "css selector (PREFER THIS)",
            "coordinate": { "x": 123, "y": 456 } (BACKUP if selector fails),
            "text": "text to type, or option value/label for select",
            "key": "Enter" | "Escape" | "Tab" (for 'keypress' action)
        }
      }

      SELECTOR PRIORITY RULES:
      1. **ROBUST SELECTORS**: Prefer page-context "s", then 'id', 'name', or the exact test-id attribute from "da".
         - Example with data-testid: "selector": "[data-testid='sign-in-email']"
         - Example with data-test: "selector": "[data-test='submit-btn']"
         - Do not invent data-test when the context shows data-testid (and vice versa).
      2. **TEXT/ARIA**: If no robust ID, use text content or aria-label.
         - Example: "selector": "button:has-text('Login')"
      3. **COORDINATES**: Use coordinates ONLY as a fallback if the element has no good selector or is inside a Shadow DOM/Canvas.

      CRITICAL RULES:
      1. **INPUT HANDLING**: To type into a field, just return type="type" with the selector. You DO NOT need to click it first. The system handles focus.
      2. **SELECT HANDLING**: To pick a dropdown option, return type="select" with the selector and
         text set to the option value or visible label. NEVER click a native select (wk="select").
         Prefer a value from opts when present.
      3. **ANTI-LOOP**: If the Page Change Detection says "No changes detected", change your
         strategy, not your pixels. Nudging a coordinate by a few pixels counts as the same
         action and is forbidden. Allowed next moves: use a CSS selector, scroll, wait, or
         pick a different element.
      4. **SUCCESS**: If the visual state matches the goal, return type="done".
      5. **GENERATED IDS ROTATE**: Selectors in the goal that end in a long random token
         (a ULID like 01KZ4CHAYW2Z1F53YF71CHB04V, a UUID, a hash, or a long number) were
         captured during an earlier crawl. Apps reseed their data, so those exact ids
         expire while the page itself is fine.
         - If such a selector is missing but the page holds elements sharing its prefix,
           for example [data-test="product-..."] with a different tail, act on the one
           that fits the goal and write in your thought that you substituted it because
           the id had rotated.
         - Treat the goal's intent as "a product of this kind", not "this exact id".
         - Only report a missing element of this kind when no element of the same family
           exists anywhere on the page.
      6. **FAILURE**: Only return type="fail" once you have scrolled through the page and
         meta.moreBelow is false, or the element is genuinely absent from the page context.
         A field you cannot see in the screenshot is not a missing field, and a rotated id
         is not a missing element.
    `;

        return this.generateAction(prompt, screenshot, runId);
    }

    async decideChaosAction(screenshot: Buffer, history: string[], profile?: any): Promise<{ thought: string, actions: Action[] }> {
        const prompt = `
      You are an Expert QA Penetration Tester. Your goal is NOT to complete the purchase successfully. Your goal is to crash the application, trigger error messages, or find logic loopholes.

      Directives:
      Fuzz Inputs: When asked for a name or text input, try emojis (😀), SQL injection patterns (' OR 1=1), or long text.
      Edge Case Navigation: If there is a 'Back' button during payment, click it. If there is a 'Quantity' field, try entering -1 or 0.
      Resource Stress: If you see a 'Generate' or 'Search' button, try clicking it.
      Visual Analysis: Look for broken layouts, overlapping text, or '500 Internal Server Error' pages.

      History of actions:
      ${history.join('\n')}

      Analyze the screenshot. Determine the next chaotic step.
      Return ONLY a JSON object with the following structure:
      {
        "thought": "I will try to inject SQL into the username field",
        "actions": [
            {
                "type": "click" | "rage_click" | "type" | "select" | "scroll" | "wait" | "navigate" | "done" | "fail",
                "reason": "short explanation of the chaos strategy",
                "selector": "css selector (optional)",
                "coordinate": { "x": 123, "y": 456 } (optional),
                "text": "text to type, or option value/label for select" (optional)
            }
        ]
      }
      
      Rules:
      1. Never return "done". Chaos never ends (until the loop limit).
      2. If you see a crash/error page, return "fail" (which indicates the app CRASHED).
      3. Do not wrap result in markdown blocks. Just raw JSON.
    `;

        const response = await this.generateAction(prompt, screenshot);
        const actions = response.actions;

        // --- NASTY STRING INJECTION ---
        // Overwrite text with nasty strings 50% of the time, or if the model specifically requested a placeholder
        // RESPECT PROFILE: Only inject if profile.injection is true (or undefined/standard)
        const shouldParams = profile?.injection ?? true;

        for (const action of actions) {
            if (shouldParams && action.type === 'type') {
                const NASTY_STRINGS = [
                    "' OR 1=1--",                // SQL Injection
                    "<script>alert(1)</script>", // XSS
                    "😀😃😄😁😆😅😂🤣",           // Emojis
                    "A".repeat(1000),            // Buffer Overflow / Long Text
                    "-1",                        // Negative Numbers
                    "0",                         // Zero
                    "undefined",                 // JS primitives
                    "null",
                    "{{7*7}}",                   // SSTI
                    "../../etc/passwd"           // Path Traversal
                ];

                const shouldInject = Math.random() < 0.5 || action.text?.includes("NASTY") || !action.text;
                if (shouldInject) {
                    const randomString = NASTY_STRINGS[Math.floor(Math.random() * NASTY_STRINGS.length)];
                    action.text = randomString;
                    action.reason = (action.reason || "") + ` [Injected Nasty String: ${randomString}]`;
                }
            }
        }

        return response;
    }

    /**
     * Collects every top level balanced {...} group in the text.
     * The model often writes prose containing braces, so the first group
     * is not reliably the action payload.
     */
    private findBalancedGroups(text: string): string[] {
        const groups: string[] = [];
        let depth = 0;
        let start = -1;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (char === '}') {
                if (depth === 0) continue;
                depth--;
                if (depth === 0 && start !== -1) {
                    groups.push(text.substring(start, i + 1));
                    start = -1;
                }
            }
        }

        return groups;
    }

    /**
     * Picks the balanced group that actually carries an action.
     * Prefers the last usable candidate because models tend to reason first
     * and emit the final JSON payload at the end of the response.
     */
    private extractActionJSON(text: string): string | null {
        const groups = this.findBalancedGroups(text);
        let fallback: string | null = null;

        for (const group of groups) {
            let parsed: any;
            try {
                parsed = JSON.parse(this.repairJSON(group));
            } catch {
                continue;
            }

            if (!parsed || typeof parsed !== 'object') continue;

            const carriesAction = (parsed.action && parsed.action.type) ||
                typeof parsed.type === 'string' ||
                Array.isArray(parsed.actions);

            if (carriesAction) fallback = group;
        }

        return fallback;
    }

    private repairJSON(json: string): string {
        try {
            // Remove trailing commas before closing braces/brackets
            let repaired = json.replace(/,\s*([}\]])/g, '$1');

            // Fix unescaped newlines in strings (common LLM failure)
            // This is tricky but we can try to find text between quotes and fix it
            // For now, let's just handle the trailing comma which is the most common
            return repaired;
        } catch {
            return json;
        }
    }

    private async generateAction(prompt: string, screenshot: Buffer, runId?: number): Promise<{ thought: string, actions: Action[] }> {

        // Convert Buffer to base64
        const imagePart = {
            inlineData: {
                data: screenshot.toString('base64'),
                mimeType: 'image/jpeg',
            },
        };

        let retries = 3;
        let delay = 2000;

        while (retries > 0) {
            try {
                const result = await this.model.generateContent([prompt, imagePart]);
                const response = result.response;
                const text = response.text();

                console.log('Gemini Response:', text);

                // Extract JSON using balanced braces
                const jsonStr = this.extractActionJSON(text);
                if (!jsonStr) {
                    throw new SyntaxError("No JSON found in response");
                }

                const repaired = this.repairJSON(jsonStr);
                const parsed = JSON.parse(repaired);

                // Handle both old format (direct Action) and new format ({ thought, action })
                const action = (parsed.action ? parsed.action : parsed) as Action;
                const thought = parsed.thought || action.reason;

                if (!Array.isArray(parsed.actions) && !action.type) {
                    // Executing a typeless action burns an iteration and does nothing
                    throw new SyntaxError("Parsed JSON has no action type");
                }

                if (runId) {
                    // Publish the specific "Chain of Thought" event
                    if (parsed.thought) {
                        redis.publish('reliqa-events', JSON.stringify({
                            runId,
                            type: 'log',
                            message: `💭 BIG BRAIN: ${parsed.thought}`, // Distinct prefix
                            timestamp: new Date()
                        }));
                    }

                    redis.publish('reliqa-events', JSON.stringify({ runId, type: 'step', action, timestamp: new Date() }));
                }

                return { thought, actions: parsed.actions || [action] };
            } catch (error: any) {
                console.error(`VisionBrain Error (Attempts left: ${retries}):`, error);

                if (error.message?.includes('429') || error.status === 429 || error instanceof SyntaxError || error.message?.includes('JSON')) {
                    const isRateLimit = error.message?.includes('429') || error.status === 429;
                    const errorType = isRateLimit ? 'Rate limited' : 'Parse error';
                    const rateLimitMsg = `⏳ ${errorType}. Waiting ${isRateLimit ? delay : 500}ms... (Attempts left: ${retries})`;
                    console.log(rateLimitMsg);
                    if (runId) {
                        redis.publish('reliqa-events', JSON.stringify({
                            runId,
                            type: 'log',
                            message: `⚠️ ${rateLimitMsg}`,
                            timestamp: new Date()
                        }));
                    }
                    await new Promise(resolve => setTimeout(resolve, isRateLimit ? delay : 500));
                    if (isRateLimit) delay *= 2; // Exponential backoff for rate limits
                    retries--;
                } else {
                    const errMsg = `Brain error: ${error.message}`;
                    if (runId) {
                        redis.publish('reliqa-events', JSON.stringify({
                            runId,
                            type: 'log',
                            message: `❌ ${errMsg}`,
                            timestamp: new Date()
                        }));
                    }
                    // Non-retriable error
                    return { thought: "Error", actions: [{ type: 'wait', duration: 2000, reason: errMsg }] };
                }
            }
        }

        return { thought: "Rate Limit Exceeded", actions: [{ type: 'wait', duration: 5000, reason: 'Brain freeze (rate limited)' }] };
    }
}
