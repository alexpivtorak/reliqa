'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Run, getRuns } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlayCircle, Clock, CheckCircle, XCircle } from 'lucide-react';

export function RunsList() {
    const [runs, setRuns] = useState<Run[]>([]);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadMissions = async (cursor?: number) => {
        if (cursor) setLoadingMore(true);
        else setLoading(true);
        setError(null);

        try {
            const data = await getRuns(10, cursor);
            setRuns(prev => cursor ? [...prev, ...data.runs] : data.runs);
            setNextCursor(data.nextCursor);
        } catch (err) {
            console.error("Failed to load missions", err);
            setError("Failed to load missions. Please try again.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        loadMissions();

        // Connect to Global Stream for real-time updates
        const eventSource = new EventSource('/api/stream/global');

        eventSource.addEventListener('run-created', (e: any) => {
            try {
                const newRun = JSON.parse(e.data);
                console.log('New Run Recieved:', newRun);
                setRuns(prev => [newRun, ...prev]);
            } catch (err) {
                console.error("Failed to parse run-created event", err);
            }
        });

        eventSource.addEventListener('status-update', (e: any) => {
            try {
                const data = JSON.parse(e.data);
                setRuns(prev => prev.map(run =>
                    run.id === data.runId ? { ...run, status: data.status, result: data.result } : run
                ));
            } catch (err) {
                console.error("Failed to parse status-update event", err);
            }
        });

        return () => {
            eventSource.close();
        };
    }, []);

    if (loading) return <div className="text-center p-10">Loading missions...</div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {runs.map((run) => (
                    <Link href={`/run/${run.id}`} key={run.id} className="block transition-transform hover:scale-105">
                        <Card className="h-full border-l-4 border-l-primary/50 hover:border-l-primary">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium truncate" title={run.goal}>
                                    Mission #{run.id}: {(() => {
                                        try {
                                            return new URL(run.url).hostname.replace('www.', '');
                                        } catch {
                                            return run.url;
                                        }
                                    })()}
                                </CardTitle>
                                {getStatusBadge(run.status, run.result)}
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                    <Clock className="w-3 h-3" />
                                    {new Date(run.createdAt).toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground truncate" title={run.url}>
                                    🔗 {run.url}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
                {runs.length === 0 && !error && (
                    <div className="col-span-full text-center text-muted-foreground p-10">
                        No missions found. Start one!
                    </div>
                )}
            </div>

            {error && (
                <div className="text-center p-4 text-destructive bg-destructive/10 rounded-lg">
                    {error}
                    <Button variant="ghost" size="sm" onClick={() => loadMissions(nextCursor ?? undefined)} className="ml-2 underline">
                        Retry
                    </Button>
                </div>
            )}

            {nextCursor && !error && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        onClick={() => loadMissions(nextCursor)}
                        disabled={loadingMore}
                        className="w-full md:w-auto"
                    >
                        {loadingMore ? "Loading more..." : "Load More Missions"}
                    </Button>
                </div>
            )}
        </div>
    );
}

function getStatusBadge(status: string, result: string | null) {
    if (status === 'running') return <Badge variant="default" className="bg-blue-500 animate-pulse">Running</Badge>;
    if (status === 'queued') return <Badge variant="secondary">Queued</Badge>;
    if (status === 'completed') {
        return result === 'pass'
            ? <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Pass</Badge>
            : <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Fail</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
}
