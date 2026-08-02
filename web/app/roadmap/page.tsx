import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const phases = [
    {
        id: 1,
        title: 'The Glass Box',
        subtitle: 'The "Trust" Phase',
        status: 'In Progress',
        statusColor: 'bg-green-500/20 text-green-400 border-green-500/30',
        emoji: '🟢',
        goal: 'Stop the AI from being a "Black Box." Give developers a real-time view of what the Agent is seeing and thinking.',
        dashboardFeatures: [
            'Live Stream Player — Embed a VNC or MJPEG stream of the Playwright browser with action overlays.',
            'The "Thought" Console — A scrolling log showing the AI\'s reasoning chain.',
        ],
        settings: [
            'Vision Model: Toggle between gemini-2.0-flash (Speed) and gemini-1.5-pro (Reasoning).',
            'Headless Mode: true / false.',
            'Target URL: The entry point for the test.',
        ],
        tech: [
            'Backend: Server-Sent Events (SSE) for real-time "Thought" streaming.',
            'Storage: Basic Drizzle schema for TestRuns and Logs.',
        ],
    },
    {
        id: 2,
        title: 'The Iron Clad',
        subtitle: 'The "Resiliency" Phase',
        status: 'Planned',
        statusColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        emoji: '🟡',
        goal: 'Move beyond "Happy Path" testing. Introduce stress testing and caching to speed up execution and find edge cases.',
        dashboardFeatures: [
            'Timeline Editor (Forensics View) — A horizontal track of the test run with step replay.',
            'Chaos Control Panel — Gamified sliders for Latency (0ms–5000ms) and Packet Drop Rate (0%–20%).',
            'Cache Indicator — Visual badge showing if a step was 🤖 AI Generated (Slow) or ⚡ Cache Hit (Fast).',
        ],
        settings: [
            'Chaos Profiles: Gremlin Mode (random clicks, high latency), Hacker Mode (SQLi injection).',
            'Max Retries: How many times the AI can self-heal a failed step (default: 3).',
        ],
        tech: [
            'Smart Caching: Anchor Strategy (caching selectors/text, not coordinates).',
            'Network Interception: Playwright route API for injecting latency and failures.',
        ],
    },
    {
        id: 3,
        title: 'The Hive Mind',
        subtitle: 'The "Enterprise" Phase',
        status: 'Future',
        statusColor: 'bg-red-500/20 text-red-400 border-red-500/30',
        emoji: '🔴',
        goal: 'Features required for teams, billing, and large-scale parallel execution.',
        dashboardFeatures: [
            'ROI Ledger — Widget showing: "Reliqa fixed 14 broken selectors this week. Saved 5.2 engineering hours."',
            'Visual Regression Diff — Baseline vs. Current screenshots with diff overlay.',
            'Fleet Status — Grid view of 50+ concurrent browsers running tests in parallel.',
        ],
        settings: [
            'Schedule: Cron-job settings (e.g., "Run regression suite every night at 3 AM").',
            'Notifications: Slack/Email webhooks for "Test Failed" or "Healing Event."',
            'Strictness: Strict (fail on any visual change > 1%) / Lenient (ignore minor layout shifts).',
        ],
        tech: [
            'Orchestration: Kubernetes or Docker Swarm for scaling Workers.',
            'S3 / Blob Storage: For storing video recordings and screenshots efficiently.',
        ],
    },
];

export default function RoadmapPage() {
    return (
        <div className="flex flex-col items-center p-8 md:p-24">
            <div className="w-full max-w-5xl space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        Reliqa Roadmap
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        From a single-player prototype to an enterprise-grade Autonomous QA Platform.
                    </p>
                </div>

                {/* Timeline */}
                <div className="space-y-6">
                    {phases.map((phase) => (
                        <Card key={phase.id} className="relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-blue-500 opacity-60" />
                            <CardHeader className="pl-8">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <span>{phase.emoji}</span> Phase {phase.id}: {phase.title}
                                    </CardTitle>
                                    <Badge variant="outline" className={phase.statusColor}>
                                        {phase.status}
                                    </Badge>
                                </div>
                                <CardDescription className="text-base italic">
                                    {phase.subtitle}
                                </CardDescription>
                                <p className="text-sm text-muted-foreground pt-1">{phase.goal}</p>
                            </CardHeader>
                            <CardContent className="pl-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">🖥️ Dashboard</h4>
                                    <ul className="space-y-1.5">
                                        {phase.dashboardFeatures.map((f, i) => (
                                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {f}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">⚙️ Settings</h4>
                                    <ul className="space-y-1.5">
                                        {phase.settings.map((s, i) => (
                                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {s}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">🔧 Core Tech</h4>
                                    <ul className="space-y-1.5">
                                        {phase.tech.map((t, i) => (
                                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {t}</li>
                                        ))}
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
