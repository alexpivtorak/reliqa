import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function CodeBlock({ children }: { children: string }) {
    return (
        <pre className="bg-muted/50 border rounded-lg p-4 text-sm font-mono overflow-x-auto">
            <code>{children}</code>
        </pre>
    );
}

export default function DocsPage() {
    return (
        <div className="flex flex-col items-center p-8 md:p-24">
            <div className="w-full max-w-5xl space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <span>📖</span> Documentation
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Everything you need to get started with Reliqa.
                    </p>
                </div>

                {/* Overview */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                        <p>
                            Reliqa is a scalable, containerized platform that uses <strong className="text-foreground">Google Gemini</strong> (Vision) and <strong className="text-foreground">Playwright</strong> to autonomously navigate and test web applications.
                        </p>
                        <p>
                            It operates on a Job Queue architecture, making it suitable for B2B deployments where hundreds of concurrent tests might be needed.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <div className="border rounded-lg p-3 bg-muted/30">
                                <h4 className="font-semibold text-foreground text-xs mb-1">👁️ Visual Intelligence</h4>
                                <p className="text-xs">Uses Gemini (gemini-2.5-flash by default) to "see" the page and make decisions based on pixels, not just code selectors.</p>
                            </div>
                            <div className="border rounded-lg p-3 bg-muted/30">
                                <h4 className="font-semibold text-foreground text-xs mb-1">🔥 Chaos Mode</h4>
                                <p className="text-xs">Optional "Monkey Testing" mode to stress-test applications with network chaos and input fuzzing.</p>
                            </div>
                            <div className="border rounded-lg p-3 bg-muted/30">
                                <h4 className="font-semibold text-foreground text-xs mb-1">📈 Scalable</h4>
                                <p className="text-xs">Built on Redis (BullMQ) and Docker, allowing horizontal scaling of worker nodes.</p>
                            </div>
                            <div className="border rounded-lg p-3 bg-muted/30">
                                <h4 className="font-semibold text-foreground text-xs mb-1">💾 Permanent Records</h4>
                                <p className="text-xs">Stores all test runs, logs, and issues in PostgreSQL with video recordings.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Architecture */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">🏗️ Architecture</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="border rounded-lg p-4 text-center bg-muted/20">
                                <div className="text-2xl mb-2">🐳</div>
                                <h4 className="font-semibold text-sm">Manager (Docker)</h4>
                                <p className="text-xs text-muted-foreground mt-1">PostgreSQL + Redis</p>
                                <p className="text-xs text-muted-foreground">Persistence & Job Queue</p>
                            </div>
                            <div className="border rounded-lg p-4 text-center bg-muted/20">
                                <div className="text-2xl mb-2">⚙️</div>
                                <h4 className="font-semibold text-sm">Worker (Node.js)</h4>
                                <p className="text-xs text-muted-foreground mt-1">Consumes jobs</p>
                                <p className="text-xs text-muted-foreground">Launches Playwright & AI loop</p>
                            </div>
                            <div className="border rounded-lg p-4 text-center bg-muted/20">
                                <div className="text-2xl mb-2">🧠</div>
                                <h4 className="font-semibold text-sm">Brain (Gemini)</h4>
                                <p className="text-xs text-muted-foreground mt-1">Vision Language Model</p>
                                <p className="text-xs text-muted-foreground">Decides actions from screenshots</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Start */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">🚀 Quick Start</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-sm">
                        {/* Prerequisites */}
                        <div>
                            <h3 className="font-semibold mb-2">Prerequisites</h3>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                                <li>Docker Desktop (must be running)</li>
                                <li>Node.js v20+</li>
                                <li>A Google AI Studio API Key</li>
                            </ul>
                        </div>

                        {/* Step 1 */}
                        <div>
                            <h3 className="font-semibold mb-2">1. Setup Environment</h3>
                            <CodeBlock>{`pnpm install`}</CodeBlock>
                            <p className="text-xs text-muted-foreground mt-2">Installs Node deps and Playwright browsers via <code className="bg-muted px-1 rounded">postinstall</code>.</p>
                            <p className="text-xs text-muted-foreground mt-2">Create a <code className="bg-muted px-1 rounded">.env</code> file in the root:</p>
                            <CodeBlock>{`GOOGLE_API_KEY=your_gemini_api_key_here\nDATABASE_URL=postgres://reliqa:securepassword@127.0.0.1:5433/reliqa_db\nREDIS_URL=redis://127.0.0.1:6379\nGEMINI_MODEL=gemini-2.5-flash # Optional, defaults to gemini-2.5-flash`}</CodeBlock>
                        </div>

                        {/* Step 2 */}
                        <div>
                            <h3 className="font-semibold mb-2">2. Start Infrastructure</h3>
                            <CodeBlock>{`docker-compose up -d postgres redis\npnpm run db:push`}</CodeBlock>
                        </div>

                        {/* Step 3 */}
                        <div>
                            <h3 className="font-semibold mb-2">3. Start the Services</h3>
                            <CodeBlock>{`# Terminal 1: API Server\npnpm run start:server\n\n# Terminal 2: Worker\npnpm run start:worker\n\n# Terminal 3: Dashboard\ncd web && pnpm run dev`}</CodeBlock>
                        </div>

                        {/* Step 4 */}
                        <div>
                            <h3 className="font-semibold mb-2">4. Trigger a Test</h3>
                            <CodeBlock>{`# Standard Goal-Oriented Test\npnpm run trigger https://www.google.com "Search for entropy"\n\n# Chaos Mode (Monkey Testing)\npnpm run trigger https://example.com "Crash this site" chaos\n\n# Multi-Step Flow (E2E Test) - see tests.json for all 10 pre-built flows\npnpm run trigger:flow sauce-nav-flow`}</CodeBlock>
                        </div>
                    </CardContent>
                </Card>

                {/* Troubleshooting */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">🔧 Troubleshooting</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="border rounded-lg p-3 bg-muted/20">
                                <h4 className="text-sm font-semibold">Database Connection Error</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ensure Docker is running. The default port is mapped to <code className="bg-muted px-1 rounded">5433</code> to avoid conflicts with local Postgres instances.
                                </p>
                            </div>
                            <div className="border rounded-lg p-3 bg-muted/20">
                                <h4 className="text-sm font-semibold">AI 404 Error</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ensure you are using a valid model name. The Vision Brain defaults to <code className="bg-muted px-1 rounded">gemini-2.5-flash</code>, overridable via the <code className="bg-muted px-1 rounded">GEMINI_MODEL</code> env var.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
