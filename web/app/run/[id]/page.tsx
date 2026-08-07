'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Run, Step, getRun, getStreamUrl, stopRun, UnauthorizedError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Terminal, Camera, Zap, Video, Square, Copy, Check } from 'lucide-react';
import { VideoPlayer } from '@/components/video-player';
import { MissionForm } from '@/components/mission-form';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function RunPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const [run, setRun] = useState<Run | null>(null);
    const [logs, setLogs] = useState<{ message: string, timestamp: string, type: 'log' | 'thought' }[]>([]);
    const [status, setStatus] = useState('connecting');
    const [liveFrame, setLiveFrame] = useState<string | null>(null);
    const [isReplayingCache, setIsReplayingCache] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    const handleCopyLogs = () => {
        const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const [isRerunOpen, setIsRerunOpen] = useState(false);

    const [isStopping, setIsStopping] = useState(false);
    const handleStop = async () => {
        if (!run || !id) return;
        if (!confirm("Are you sure you want to stop this mission?")) return;

        setIsStopping(true);
        try {
            await stopRun(id);
            // Status update will come via SSE
        } catch (error) {
            if (error instanceof UnauthorizedError) return;
            console.error(error);
            alert("Failed to stop mission.");
        } finally {
            setIsStopping(false);
        }
    };

    // Initial Load
    useEffect(() => {
        getRun(id).then(data => {
            setRun(data);

            // Load existing logs if available
            if (data.logs) {
                try {
                    const parsed = typeof data.logs === 'string' ? JSON.parse(data.logs) : data.logs;
                    if (Array.isArray(parsed)) {
                        setLogs(parsed.map((m: string) => ({
                            message: m,
                            timestamp: data.createdAt, // approximation
                            type: m.includes('Action:') ? 'thought' : 'log'
                        })));
                    }
                } catch (e) {
                    console.error('Failed to parse logs:', e);
                }
            }
        }).catch(err => {
            if (err instanceof UnauthorizedError) return;
            console.error(err);
        });
    }, [id]);

    // SSE Connection for live logs, steps, frames, and status
    useEffect(() => {
        const streamUrl = getStreamUrl(id);
        const es = new EventSource(streamUrl);

        es.addEventListener('open', () => {
            setStatus('connected');
        });

        es.addEventListener('log', (e) => {
            try {
                const data = JSON.parse(e.data);
                const message: string = data.message ?? '';

                // The worker brackets every cache replay with these sentinels
                if (message.includes('CACHE START')) {
                    setIsReplayingCache(true);
                } else if (
                    message.includes('FAST FORWARD') ||
                    message.includes('CACHE FALLBACK') ||
                    message.includes('Capturing page state')
                ) {
                    setIsReplayingCache(false);
                }

                setLogs(prev => [...prev, {
                    message: data.message,
                    timestamp: data.timestamp || new Date().toISOString(),
                    type: data.message?.includes('Action:') ? 'thought' : 'log'
                }]);
                // Auto-scroll
                setTimeout(() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                }, 50);
            } catch (err) {
                console.error('Failed to parse log event:', err);
            }
        });



        es.addEventListener('frame', (e) => {
            setLiveFrame(e.data);
        });

        es.addEventListener('status', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.status) {
                    setIsReplayingCache(false);
                    setRun(prev => prev ? {
                        ...prev,
                        status: data.status,
                        result: data.result ?? prev.result,
                        videoUrl: data.videoUrl ?? prev.videoUrl
                    } : prev);
                    setLogs(prev => [...prev, {
                        message: `Mission status changed to: ${data.status}${data.result ? ` (${data.result})` : ''}`,
                        timestamp: data.timestamp || new Date().toISOString(),
                        type: 'log'
                    }]);
                }
            } catch (err) {
                console.error('Failed to parse status event:', err);
            }
        });

        es.addEventListener('error', () => {
            setStatus('disconnected');
        });

        return () => {
            es.close();
            setStatus('disconnected');
        };
    }, [id]);

    if (!run) return <div className="p-10">Loading Mission {id}...</div>;

    return (
        <div className="flex flex-col p-6 h-full overflow-hidden">
            <header className="flex items-center justify-between mb-6 border-b pb-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        Mission #{run.id}: {(() => {
                            try {
                                return new URL(run.url).hostname.replace('www.', '');
                            } catch {
                                return run.url;
                            }
                        })()}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm italic max-w-4xl truncate" title={run.goal}>
                        Goal: {run.goal}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <Badge variant={status === 'connected' ? 'default' : 'secondary'} className="animate-pulse">
                            {status === 'connected' ? '● LIVE' : '○ DISCONNECTED'}
                        </Badge>
                        <Badge variant="outline">{run.status}</Badge>
                        <span className="text-sm">{run.url}</span>
                        {run.model && <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">🤖 {run.model}</Badge>}
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                    {(run.status === 'running' || run.status === 'stopping') && (
                        <Button
                            variant="destructive"
                            size="sm"
                            className="gap-2 bg-red-600 hover:bg-red-700"
                            onClick={handleStop}
                            disabled={isStopping || run.status === 'stopping'}
                        >
                            <Square className="w-4 h-4 fill-current" />
                            {run.status === 'stopping' ? 'Stopping...' : 'STOP Mission'}
                        </Button>
                    )}

                    <Dialog open={isRerunOpen} onOpenChange={setIsRerunOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Zap className="w-4 h-4" /> Re-run Mission
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Re-run Mission #{run.id}</DialogTitle>
                                <DialogDescription>
                                    Settings are copied from this run. Change anything you need, then launch again.
                                </DialogDescription>
                            </DialogHeader>
                            <MissionForm
                                key={run.id}
                                initialValues={{
                                    url: run.url,
                                    goal: run.goal,
                                    model: run.model ?? "gemini-2.5-flash",
                                    isChaos: run.mode === "chaos",
                                    chaosProfile: run.chaosProfile ?? null,
                                    headless: run.headless ?? true,
                                    disableCache: run.disableCache ?? false,
                                }}
                                submitLabel="🚀 Start Re-run"
                                onLaunched={(runId) => {
                                    setIsRerunOpen(false);
                                    router.push(`/run/${runId}`);
                                }}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </header>

            {/* Rest of UI */}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left: Video / Timeline */}
                <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
                    <CardHeader className="pb-0">
                        <CardTitle className="flex items-center gap-2">
                            <Video className="w-5 h-5 text-purple-500" />
                            {run.status === 'running' ? 'Live Feed' : 'Mission Replay'}
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="flex-1 px-4 pb-4 pt-0 flex flex-col gap-4 overflow-hidden">
                        {/* Video Player Area */}
                        <div className="flex-1 bg-black rounded-lg flex items-center justify-center overflow-hidden border shadow-inner relative">
                            {isReplayingCache && run.status === 'running' && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-200 backdrop-blur"
                                >
                                    <Zap className="w-3 h-3 fill-current" aria-hidden="true" />
                                    Replaying cached steps
                                </div>
                            )}
                            {run.status === 'running' && liveFrame ? (
                                <img
                                    src={`data:image/jpeg;base64,${liveFrame}`}
                                    className="w-full h-full object-contain"
                                    alt="Live Stream"
                                />
                            ) : run.videoUrl ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    <VideoPlayer src={run.videoUrl} />
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground">
                                    {run.status === 'running' ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                                            <p>Agent is working...</p>
                                        </div>
                                    ) : (
                                        <p>No recording available for this run.</p>
                                    )}
                                </div>
                            )}
                        </div>


                    </CardContent>
                </Card>

                {/* Right: Thought Console & Logs */}
                <Card className="flex flex-col h-full bg-black text-green-400 font-mono text-sm border-zinc-800 shadow-2xl overflow-hidden">
                    <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 py-3 shrink-0 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-green-500 flex items-center gap-2 text-base">
                            <Terminal className="w-4 h-4" /> THOUGHT CONSOLE
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
                            onClick={handleCopyLogs}
                            title="Copy logs to clipboard"
                        >
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                    </CardHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto p-4" ref={scrollRef}>
                        <div className="space-y-1.5">
                            {logs.map((log, i) => {
                                const rawMsg = log.message || '';
                                // Strip existing emojis from the message to avoid duplicates
                                const cleanMsg = rawMsg.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}⚡⚠️✅❌]/gu, '').trim();
                                // Classify log type by content
                                let emoji = '>';
                                let textColor = 'text-green-300';
                                let borderColor = 'border-zinc-700';

                                const isFromCache = /cache/i.test(rawMsg) || rawMsg.includes('FAST FORWARD');

                                if (rawMsg.includes('Action:') || rawMsg.includes('👉')) {
                                    emoji = '⚡'; textColor = 'text-yellow-400'; borderColor = 'border-yellow-600';
                                } else if (rawMsg.includes('Capturing') || rawMsg.includes('📸')) {
                                    emoji = '📸'; textColor = 'text-cyan-400'; borderColor = 'border-cyan-700';
                                } else if (rawMsg.includes('Thinking') || rawMsg.includes('🧠')) {
                                    emoji = '🧠'; textColor = 'text-purple-400'; borderColor = 'border-purple-700';
                                } else if (rawMsg.includes('Analyzing') || rawMsg.includes('🔍')) {
                                    emoji = '🔍'; textColor = 'text-blue-400'; borderColor = 'border-blue-700';
                                } else if (rawMsg.includes('Observer') || rawMsg.includes('⚠️')) {
                                    emoji = '⚠️'; textColor = 'text-red-400'; borderColor = 'border-red-600';
                                } else if (rawMsg.includes('Step') || rawMsg.includes('📍')) {
                                    emoji = '📍'; textColor = 'text-orange-400'; borderColor = 'border-orange-600';
                                } else if (rawMsg.includes('FAST FORWARD') || rawMsg.includes('⚡')) {
                                    emoji = '⚡'; textColor = 'text-amber-300'; borderColor = 'border-amber-600';
                                } else if (rawMsg.includes('status changed') || rawMsg.includes('Mission')) {
                                    emoji = '🚀'; textColor = 'text-emerald-400'; borderColor = 'border-emerald-600';
                                } else if (rawMsg.includes('Connected') || rawMsg.includes('stream')) {
                                    emoji = '🔗'; textColor = 'text-sky-400'; borderColor = 'border-sky-700';
                                } else if (rawMsg.includes('✅') || rawMsg.includes('Completed') || rawMsg.includes('PASS')) {
                                    emoji = '✅'; textColor = 'text-green-400'; borderColor = 'border-green-600';
                                } else if (rawMsg.includes('❌') || rawMsg.includes('FAIL') || rawMsg.includes('Error')) {
                                    emoji = '❌'; textColor = 'text-red-400'; borderColor = 'border-red-600';
                                }

                                if (isFromCache) {
                                    emoji = '⚡'; textColor = 'text-amber-300'; borderColor = 'border-amber-600';
                                }

                                return (
                                    <div key={i} className={`break-words border-l-2 ${borderColor} pl-2 py-0.5 hover:bg-zinc-900/50 transition-colors`}>
                                        <span className="text-zinc-600 text-xs">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                                        {isFromCache && (
                                            <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1 text-[10px] font-bold text-amber-300 align-middle">
                                                CACHE
                                            </span>
                                        )}{' '}
                                        <span className={textColor}>
                                            {emoji} {cleanMsg}
                                        </span>
                                    </div>
                                );
                            })}
                            {status === 'connected' && (
                                <div className="animate-pulse">_</div>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
