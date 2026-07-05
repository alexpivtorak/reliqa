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

        // Prioritize passed model, then env var, then default to 2.0-flash
        const selectedModel = modelName || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        console.log(`🤖 VisionBrain initialized with model: ${selectedModel}`);
        this.model = this.genAI.getGenerativeModel({ model: selectedModel });
    }

    async decideAction(screenshot: Buffer, goal: string, history: string[], pageContext?: string, domDiff?: string, runId?: number): Promise<{ thought: string, actions: Action[] }> {
        const contextSection = pageContext ? `
      
      PAGE CONTEXT (Distilled DOM):
      The page context is provided as a compressed JSON list of interactive elements.
      - t: tag name (btn=button, inp=input, etc.)
      - c: [x, y] center coordinates (USE THESE for precise clicking)
      - txt: visible text or value
      - dt: data-test or data-testid
      - l: label/aria-label/placeholder
      - id: element id
      
      ${pageContext}
      
      SELECTOR PRIORITY:
      1. data-test/id/name: [data-test='value'], #id, [name='value'] (Highly reliable, use whenever available)
      2. Text/Label/ARIA: button:has-text('Login'), [aria-label='Search']
      3. Coordinate: { "coordinate": { "x": 123, "y": 456 } } (Use 'c' values from context ONLY as a fallback if no good CSS selector is available, e.g., in Shadow DOM or custom canvases)
      
      IMPORTANT: Always prefer providing a robust CSS selector over coordinates. Coordinates should be used as a fallback because selectors are more resilient to layout shifts and page resizing.
      ` : '';

        // Add DOM diff info if available
        const diffSection = domDiff ? `
      
      PAGE CHANGE DETECTION:
      ${domDiff}
      
      Use this to verify if your last action had an effect. If "No changes detected" after multiple clicks, try a different approach.
      ` : '';

        if (runId) {
            redis.publish('wolfqa-events', JSON.stringify({ runId, type: 'thought', message: 'Analyzing page state...', timestamp: new Date() }));
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
            "type": "click" | "type" | "keypress" | "scroll" | "hover" | "wait" | "navigate" | "done" | "fail",
            "reason": "short explanation for logs",
            "selector": "css selector (PREFER THIS)",
            "coordinate": { "x": 123, "y": 456 } (BACKUP if selector fails),
            "text": "text to type" (for 'type' action),
            "key": "Enter" | "Escape" | "Tab" (for 'keypress' action)
        }
      }

      SELECTOR PRIORITY RULES:
      1. **ROBUST SELECTORS**: Always prefer 'id', 'data-test', 'data-testid', 'name' attributes.
         - Example: "selector": "[data-test='submit-btn']"
      2. **TEXT/ARIA**: If no robust ID, use text content or aria-label.
         - Example: "selector": "button:has-text('Login')"
      3. **COORDINATES**: Use coordinates ONLY as a fallback if the element has no good selector or is inside a Shadow DOM/Canvas.

      CRITICAL RULES:
      1. **INPUT HANDLING**: To type into a field, just return type="type" with the selector. You DO NOT need to click it first. The system handles focus.
      2. **ANTI-LOOP**: If you tried an action and the Page Change Detection says "No changes detected", DO NOT try the exact same action again. Try a different selector or coordinate.
      3. **SUCCESS**: If the visual state matches the goal, return type="done".
      4. **FAILURE**: If you are stuck after 3 attempts, return type="fail".
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
                "type": "click" | "rage_click" | "type" | "scroll" | "wait" | "navigate" | "done" | "fail",
                "reason": "short explanation of the chaos strategy",
                "selector": "css selector (optional)",
                "coordinate": { "x": 123, "y": 456 } (optional),
                "text": "text to type" (optional)
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

    private extractFirstJSON(text: string): string | null {
        let firstBrace = text.indexOf('{');
        if (firstBrace === -1) return null;

        let count = 0;
        let lastBrace = -1;

        for (let i = firstBrace; i < text.length; i++) {
            if (text[i] === '{') count++;
            if (text[i] === '}') {
                count--;
                if (count === 0) {
                    lastBrace = i;
                    break;
                }
            }
        }

        if (lastBrace === -1) return null;
        return text.substring(firstBrace, lastBrace + 1);
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
                const jsonStr = this.extractFirstJSON(text);
                if (!jsonStr) {
                    throw new SyntaxError("No JSON found in response");
                }

                const repaired = this.repairJSON(jsonStr);
                const parsed = JSON.parse(repaired);

                // Handle both old format (direct Action) and new format ({ thought, action })
                const action = (parsed.action ? parsed.action : parsed) as Action;
                const thought = parsed.thought || action.reason;

                if (runId) {
                    // Publish the specific "Chain of Thought" event
                    if (parsed.thought) {
                        redis.publish('wolfqa-events', JSON.stringify({
                            runId,
                            type: 'log',
                            message: `💭 BIG BRAIN: ${parsed.thought}`, // Distinct prefix
                            timestamp: new Date()
                        }));
                    }

                    redis.publish('wolfqa-events', JSON.stringify({ runId, type: 'step', action, timestamp: new Date() }));
                }

                return { thought: parsed.thought, actions: parsed.actions || [action] };
            } catch (error: any) {
                console.error(`VisionBrain Error (Attempts left: ${retries}):`, error);

                if (error.message?.includes('429') || error.status === 429 || error instanceof SyntaxError || error.message?.includes('JSON')) {
                    const isRateLimit = error.message?.includes('429') || error.status === 429;
                    const errorType = isRateLimit ? 'Rate limited' : 'Parse error';
                    const rateLimitMsg = `⏳ ${errorType}. Waiting ${isRateLimit ? delay : 500}ms... (Attempts left: ${retries})`;
                    console.log(rateLimitMsg);
                    if (runId) {
                        redis.publish('wolfqa-events', JSON.stringify({
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
                        redis.publish('wolfqa-events', JSON.stringify({
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
