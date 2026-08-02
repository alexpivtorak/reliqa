# Reliqa - Agentic Quality Assurance Platform

> **Reliqa**: An AI-powered QA agent that tests your web application like a chaotic human.

## Overview

Reliqa is a scalable, containerized platform that uses **Google Gemini** (Vision) and **Playwright** to autonomously navigate and test web applications.

It operates on a `Job Queue` architecture, making it suitable for B2B deployments where hundreds of concurrent tests might be needed.

### Key Features
- **Visual Intelligence**: Uses Gemini (`gemini-2.5-flash` by default, override with `GEMINI_MODEL`) to "see" the page and make decisions based on pixels, not just code selectors.
- **Chaos Mode**: Optional "Monkey Testing" mode to stress-test applications.
- **Scalable**: Built on Redis (BullMQ) and Docker, allowing horizontal scaling of worker nodes.
- **Permanent Records**: Stores all test runs, logs, and issues in PostgreSQL.

## Architecture

1.  **Manager (Docker)**: Orchestrates the system.
    -   `PostgreSQL`: Database for persistence.
    -   `Redis`: Job Queue.
2.  **Worker (Node.js)**: Consumes jobs, launches Playwright, and runs the AI loop.
3.  **Brain (Gemini)**: The Vision Language Model (VLM) deciding actions.

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Must be running)
- [Node.js](https://nodejs.org/) (v20+)
- A Google AI Studio API Key

### 1. Setup Environment
Clone the repo and install everything (Node deps + Playwright browsers) with one command:

```bash
pnpm install
```

`postinstall` runs `playwright install chromium` automatically, including after Playwright version upgrades.

Create a `.env` file in the root:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgres://reliqa:securepassword@127.0.0.1:5433/reliqa_db
REDIS_URL=redis://127.0.0.1:6379
GEMINI_MODEL=gemini-2.5-flash # Optional, defaults to gemini-2.5-flash

# Auth (Google sign-in via Better Auth)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
BETTER_AUTH_SECRET=generate_with_openssl_rand_base64_32
BETTER_AUTH_URL=http://localhost:3000
AUTH_ALLOWED_EMAILS=you@example.com
```

For Google sign-in, create an OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Set the authorized redirect URI to `http://localhost:3000/api/auth/callback/google`. Put your email in `AUTH_ALLOWED_EMAILS` (comma-separated) so only approved accounts can sign up.

### 2. Start Everything
The easiest way to start the entire ecosystem (Infra, API, Worker, and Web Dashboard):

```bash
# Start all services (Postgres, Redis, API, Worker, Web)
pnpm run up

# Run database migrations (first time only)
pnpm run db:push
```

### 3. Open the Dashboard
Once everything is running, open the Web Dashboard in your browser:

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000) — view live runs, launch new missions, and use Chaos Controls.
- **API Server**: `http://localhost:3001` — runs behind the dashboard (SSE streams, run/step data). No need to open this directly.

---

### 4. Trigger a Test
In another terminal, send a job to the queue:

```bash
# Standard Goal-Oriented Test
pnpm run trigger https://www.google.com "Search for entropy"

# Chaos Mode (Monkey Testing)
pnpm run trigger https://example.com "Crash this site" chaos
```

### 5. Multi-Step Flows (E2E Tests)
Define complex flows in `tests.json` (root directory). The repo ships with 10 ready-to-run flows (SauceDemo, BrowserStack Demo, DemoQA, Parabank, Google, Vivino, Hacker News, and more) — run `pnpm run trigger:flow` with no arguments to list them all.

```bash
pnpm run trigger:flow sauce-nav-flow
```

Example `tests.json` entry:
```json
[
  {
    "id": "sauce-nav-flow",
    "name": "SauceDemo Nav-Oriented Flow",
    "url": "https://www.saucedemo.com",
    "steps": [
      { "name": "1. Login", "goal": "Login with 'standard_user' & 'secret_sauce'. Verify we land on the inventory page." },
      { "name": "2. Cart Prep", "goal": "Add 'Sauce Labs Backpack' and 'Sauce Labs Bike Light' to the cart. Then click the shopping cart icon. Verify we are on the Cart page." }
    ]
  }
]
```

---

## 🛠️ Maintenance & Utility Scripts

| Command | Description |
| :--- | :--- |
| `pnpm run up` | 🚀 **Recommended**. Starts Infra + API + Worker + Front-end. |
| `pnpm run dev:all` | Starts API + Worker + Front-end (Infra must be running). |
| `pnpm run infra:up` | Starts Postgres & Redis containers only. |
| `pnpm run infra:down` | Stops all containers. |
| `pnpm run start:server` | Starts only the API server (SSE + REST endpoints). |
| `pnpm run start:worker` | Starts only the BullMQ worker that runs the agent loop. |
| `pnpm run build` | Compiles TypeScript to `dist/`. |
| `pnpm run start` | Runs the compiled build (`dist/index.js`). |
| `pnpm run trigger <url> <goal> [chaos]` | Queues a single goal-oriented (or chaos) test job. |
| `pnpm run trigger:flow [flowId]` | Queues a multi-step flow from `tests.json`, or lists all flows if no ID is given. |
| `pnpm run test` | Runs the Playwright test suite. |
| `pnpm run test:manual` | Runs the agent manually against a hardcoded scenario for debugging. |
| `pnpm run db:generate` | Generates a new Drizzle migration file from schema changes. |
| `pnpm run db:migrate` | Applies pending Drizzle migrations. |
| `pnpm run db:push` | Pushes the current schema straight to the database (first-time setup). |
| `pnpm run lint` | Runs ESLint across the project. |
| `pnpm run clean` | 🧹 **Cleanup**. Deletes all artifacts and clears the action cache. |
| `pnpm run kill:all` | Forcefully kills all running Node.js processes. |
| `pnpm run logs [runId]` | Prints the logs for a specific run, or the most recent run if no ID is given. |

## Troubleshooting

- **Database Connection Error**: Ensure Docker is running. The default port is mapped to `5433` to avoid conflicts with local Postgres instances.
- **AI 404 Error**: Ensure you are using a valid model name. The Vision Brain defaults to `gemini-2.5-flash`, overridable via the `GEMINI_MODEL` env var.
- **Playwright / Scan Application browser missing**: If you see `Executable doesn't exist` or Scan Application fails to crawl, re-run `pnpm install` (or `pnpm exec playwright install chromium`) so Chromium matches the installed Playwright version.

## 📚 Further Reading

- [`how_it_works.md`](./how_it_works.md) — Deep dive into the See → Think → Act loop, the DOM Distiller, Chaos Controller, Optimizer, and other core components.
- [`roadmap.md`](./roadmap.md) — Planned features and the phased development roadmap.
