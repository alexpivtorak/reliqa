# Reliqa Agent Failure Report: "Clean the Field" Loop

## Issue Description
The **Reliqa Agent** (powered by Gemini 2.0 Flash) gets stuck in an infinite loop while attempting to `Login`. 

Instead of proceeding to click the Login button after typing credentials, it repeatedly attempts to **"Clear username field"** by clicking various coordinates around the input box.

## Environment
- **Model**: `gemini-2.0-flash`
- **Target**: SauceDemo (Login Page)
- **Library**: Playwright
- **Context**: Standard Goal-Oriented Test

## Logs
The agent successfully types the username and password, then enters a loop:

1.  **Action**: `type` "standard_user" (Success)
2.  **Action**: `type` "secret_sauce" (Success)
3.  **Action**: `click` Login Button (Success, but maybe failed to navigate?)
4.  **Action**: `type` "standard_user" (AGAIN)
5.  **Action**: `type` "secret_sauce" (AGAIN)
6.  **Loop Begins**:
    -   `click` (x: 596, y: 136) - Reason: "Clear username field"
    -   `type` "standard_user"
    -   `error` (Internal Server Error from Gemini)
    -   `click` (x: 453, y: 127) - Reason: "Clear username field"
    -   `click` (x: 283, y: 128) - Reason: "Click on the username input field to clear the existing text"
    -   `click` (x: 520, y: 114) - Reason: "Clear the username input field"
    ... (Repeats 5+ times until timeout)

## Hypothesis
1.  **State Confusion**: The agent likely tried to log in, but the page didn't redirect fast enough (despite the 5s wait). It saw the login page again.
2.  **Visual Hallucination**: Seeing the "standard_user" text already in the field, the VLM decided the field was "dirty" and needed to be cleared before typing again.
3.  **Prompt Issue**: The system prompt does not explicitly tell the agent *not* to clear fields if the text matches the goal.

## Proposed Solutions
1.  **Prompt Tuning**: Add a rule: "If the text is already correct, DO NOT clear it. Just click Login."
2.  **State Check**: If the agent perceives it has typed the text, it should verify the *next* step (Login) rather than obsessing over the input state.
