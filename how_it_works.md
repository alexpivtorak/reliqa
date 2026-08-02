# How Reliqa Works

Reliqa is an **Agentic Quality Assurance (QA) System** that uses **Multimodal AI (Google Gemini)** and **Playwright** to autonomously test web applications. Unlike traditional selectors-based automation (Selenium/Cypress), Reliqa "looks" at the screen like a human user, understanding context and visual cues to make decisions.

## 🏗️ High-Level Architecture

The system operates on a loop of **See → Think → Act → Verify**.

```mermaid
graph TD
    A[Start Test] --> B[Browser Controller]
    B -->|Screenshot + Page Context| C[Vision Brain (Gemini)]
    C -->|Decide Action| D[Action Execution]
    D -->|Click/Type/Scroll| B
    D -->|Log State| E[Observer]
    E -->|Check for Loops| C
    E -->|Validation| F{Goal Met?}
    F -->|No| B
    F -->|Yes| G[Success & Cache]
    G --> H[End Test]
```

## 🧩 Core Components

### 1. Vision Brain (`VisionBrain.ts`)
The cognitive center of the agent.
*   **Model**: Uses `gemini-2.5-flash` by default for high-speed multimodal analysis (override with the `GEMINI_MODEL` env var).
*   **Input**: Receives a screenshot of the current page, the high-level goal (e.g., "Login with user X"), and a textual history of past actions.
*   **Context Awareness**: It is fed a "Distilled DOM" (see below) to ground its visual understanding with actual element coordinates and attributes.
*   **Output**: Structured JSON decisions (`click`, `type`, `wait`, `done`, `fail`).
*   **Chaos Mode**: Can switch prompts to act as a "Penetration Tester", actively trying to crash the app with SQL injection, emojis, or erratic behavior.

### 2. Browser Controller (`BrowserController.ts`)
The hands and eyes of the agent, wrapping **Playwright**.
*   **Level 3 DOM Distiller**: A sophisticated mechanism that traverses the entire DOM (including Shadow DOM) to create a lightweight logical map of the page. It extracts:
    *   **Coordinates**: Center `[x, y]` for every interactive element.
    *   **Attributes**: `data-test`, `aria-label`, `placeholder`.
    *   **Visibility**: Filters out hidden/overlapping elements.
*   **Smart Execution**:
    *   **Coordinate Preference**: Preferentially clicks precise coordinates (`x,y`) provided by the Brain.
    *   **Fallbacks**: If a coordinate click fails, it falls back to CSS selectors, text matching, or even keyboard navigation (`Enter` key).
    *   **Auto-Recovery**: Handles cookie consent modals automatically using multi-language heuristics.
*   **Video Recording**: Automatically records the entire session for debugging.

### 3. The Observer (`Observer.ts`)
The "conscience" or supervisor of the agent.
*   **Loop Detection**: Monitors the action history to detect if the agent is stuck (e.g., clicking the same button 5 times, or staying on the same URL for too long).
*   **Intervention**: Can force an error or intervention signal to break infinite loops.
*   **Step Validation**: Verifies if a "Login" action actually resulted in a URL change.

### 4. Worker & Orchestration (`worker/index.ts`)
The engine that drives the test.
*   **Queue-Based**: Uses `BullMQ` to process test jobs asynchronously.
*   **Caching (`ActionCache`)**: Remembers successful paths. If a specific goal on a specific URL was solved before, it attempts to replay the cached actions first (Fast Path) before falling back to the AI (Slow Path).
*   **Database**: Logs every step, screenshot, and result to a database via Drizzle ORM.

### 5. Chaos Controller (`ChaosController.ts`)
A specialized module for stress testing.
*   **Gremlins**: Intercepts network requests to simulate:
    *   **Packet Loss**: randomly aborting XHR/Fetch requests (10% chance).
    *   **High Latency**: artificial 1-3s delays (20% chance).
*   **Rage Clicks**: Rapidly clicking an element 10+ times to trigger race conditions.

### 6. Optimizer (`Optimizer.ts`)
Cleans up a recorded run before it becomes a reusable cache entry.
*   **Strips Noise**: Drops `wait` and `fail` actions so cached paths only contain the successful, decisive steps.
*   **Deduplication**: Collapses consecutive identical actions (the "typed the same field twice" or "clicked the same button twice" panic pattern) down to a single action.
*   **Output**: A minimal, clean action sequence handed off to `ActionCache` for fast-path replay.

### 7. History Manager (`HistoryManager.ts`)
Keeps the Brain's prompt context small without losing memory of the run.
*   **Rolling Window**: Keeps the last 5 actions in full detail for the prompt; older steps are collapsed into a one-line summary (e.g. `[Steps 1-6]: 6 previous actions completed`).
*   **Outcome Tracking**: Records the outcome of every action so the Brain can see whether prior attempts succeeded or produced "No changes".

### 8. Discovery Crawler (`DiscoveryCrawler.ts`)
An automated site-mapping tool, separate from the goal-driven test loop.
*   **BFS Crawl**: Starting from a URL, it breadth-first crawls the app (up to a configurable depth), visiting each new page it discovers.
*   **Sitemap Output**: Produces a graph of `nodes` (pages, with their interactive elements) and `edges` (the actions/links that connect them).
*   **Live Streaming**: Progress is streamed to the frontend over Server-Sent Events at `/api/crawl-stream`, and surfaced in the "New Mission" page so a user can see the site being mapped in real time before launching a test.

## 🔄 The "Thinking" Loop (Standard Mode)

1.  **Capture**: Browser takes a screenshot and distills the DOM.
2.  **Prompt**: The Brain constructs a prompt including the Goal, History, and DOM Context.
3.  **Decide**: Gemini analyzes the image + text and outputs the next logical action.
    *   *Example*: `{ "type": "click", "coordinate": { "x": 500, "y": 300 }, "reason": "Clicking login button" }`
4.  **Execute**: Browser performs the action.
5.  **Observe**: Observer records the state.
6.  **Repeat**: Until `done` or `fail` (or timeout).

## 🌪️ Chaos Mode

In Chaos Mode, the rules change:
*   **Goal**: "Crash the application" or "Find logic holes".
*   **Input Fuzzing**: The Brain injects "Nasty Strings" (SQLi, XSS vectors, long buffers) into input fields.
*   **Network Stress**: The Chaos Controller actively sabotages the network layer.
*   **Success**: Measuring typically fails if the app crashes (500 errors) or hangs.

## 🚀 Key Differentiators

| Feature | Reliqa | Traditional Selenium/Cypress |
| :--- | :--- | :--- |
| **Selectors** | **Visual & Coordinate-based** (Robust to DOM changes) | **Strict CSS/XPath** (Brittle) |
| **Logic** | **AI Reasoning** (Can adapt to popups/redesigns) | **Hardcoded Scripts** |
| **Maintenance** | **Low** (Self-healing) | **High** (Break on UI update) |
| **Speed** | Slow (AI Latency) + Cached (Fast) | Fast |
