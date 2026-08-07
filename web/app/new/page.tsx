"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play } from "lucide-react";
import { MissionForm } from "@/components/mission-form";

export default function NewMission() {
    return (
        <div className="flex flex-col items-center p-6 md:p-12 space-y-8 max-w-7xl mx-auto w-full">
            <Card className="w-full border-muted-foreground/20 bg-card/60 backdrop-blur">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Play className="w-5 h-5 text-purple-400" /> Launch New Mission
                    </CardTitle>
                    <CardDescription>
                        Configure an autonomous testing campaign via Manual Goal or Autonomous Discovery.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <MissionForm />
                </CardContent>
            </Card>
        </div>
    );
}
