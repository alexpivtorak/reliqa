"use client";

import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ChaosProfile {
    name: 'standard' | 'gremlin' | 'hacker';
    latency?: { min: number; max: number; chance: number };
    packetLoss?: number;
    injection?: boolean;
    rageClick?: boolean;
}

interface ChaosControlPanelProps {
    onChange: (profile: ChaosProfile) => void;
}

export function ChaosControlPanel({ onChange }: ChaosControlPanelProps) {
    const [mode, setMode] = useState<'standard' | 'gremlin' | 'hacker'>('standard');
    const [latency, setLatency] = useState([1000]); // Max latency
    const [errorRate, setErrorRate] = useState([10]); // % chance

    useEffect(() => {
        // Construct the profile based on UI state
        const profile: ChaosProfile = {
            name: mode,
            latency: { min: 500, max: latency[0], chance: 0.3 }, // Default 30% chance of lag
            packetLoss: errorRate[0] / 100, // Convert to decimal
            injection: mode === 'hacker',
            rageClick: mode === 'gremlin'
        };
        onChange(profile);
    }, [mode, latency, errorRate, onChange]);

    return (
        <Card className="w-full mt-4 border-red-200 dark:border-red-900 bg-red-50/10">
            <CardHeader className="pb-3">
                <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2 text-base">
                    🔥 Chaos Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                    Inject failures to test system resilience.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="standard" onValueChange={(val) => setMode(val as any)}>
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="standard">Standard</TabsTrigger>
                        <TabsTrigger value="gremlin">Gremlin (Jitter)</TabsTrigger>
                        <TabsTrigger value="hacker">Hacker (Security)</TabsTrigger>
                    </TabsList>

                    <div className="space-y-6">
                        {/* Latency Slider */}
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <Label>Network Latency (Max)</Label>
                                <span className="text-xs text-muted-foreground">{latency[0]}ms</span>
                            </div>
                            <Slider
                                defaultValue={[1000]}
                                max={5000}
                                step={100}
                                value={latency}
                                onValueChange={setLatency}
                                className="[&>.relative>.absolute]:bg-red-500"
                            />
                            <p className="text-xs text-muted-foreground">
                                Simulates slow connections (3G/4G)
                            </p>
                        </div>

                        {/* Error Rate Slider */}
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <Label>Request Failure Rate</Label>
                                <span className="text-xs text-muted-foreground">{errorRate[0]}%</span>
                            </div>
                            <Slider
                                defaultValue={[10]}
                                max={50}
                                step={1}
                                value={errorRate}
                                onValueChange={setErrorRate}
                                className="[&>.relative>.absolute]:bg-red-500"
                            />
                            <p className="text-xs text-muted-foreground">
                                Percentage of API requests that will fail (500/404)
                            </p>
                        </div>

                        {mode === 'hacker' && (
                            <div className="p-3 bg-black/5 rounded text-sm border border-red-200 text-red-700 dark:border-red-800 dark:text-red-300">
                                ⚠️ <strong>Injection Active:</strong> The agent will attempt SQLi and XSS payloads in all input fields.
                            </div>
                        )}
                        {mode === 'gremlin' && (
                            <div className="p-3 bg-black/5 rounded text-sm border border-orange-200 text-orange-800 dark:border-orange-800 dark:text-orange-300">
                                👾 <strong>Gremlin Active:</strong> The agent may rage-click elements and ignore standard wait times.
                            </div>
                        )}
                    </div>
                </Tabs>
            </CardContent>
        </Card>
    );
}
