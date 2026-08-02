"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Download } from "lucide-react";

interface VideoPlayerProps {
    src: string;
    poster?: string;
}

export function VideoPlayer({ src, poster }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onError = () => setError(true);

        video.addEventListener("play", onPlay);
        video.addEventListener("pause", onPause);
        video.addEventListener("error", onError);

        return () => {
            video.removeEventListener("play", onPlay);
            video.removeEventListener("pause", onPause);
            video.removeEventListener("error", onError);
        };
    }, []);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
        }
    };

    const restart = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play();
        }
    };

    if (error) {
        return (
            <div className="w-full h-64 bg-slate-100 dark:bg-slate-900 rounded-lg flex items-center justify-center text-muted-foreground">
                Video not found or failed to load.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden border bg-black aspect-video group">
                <video
                    ref={videoRef}
                    src={src}
                    poster={poster}
                    className="w-full h-full object-contain"
                    controls={false} // Custom controls
                />

                {/* Overlay Controls */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="secondary" size="icon" onClick={togglePlay} className="rounded-full w-12 h-12">
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                    </Button>
                </div>
            </div>

            <div className="flex justify-between items-center text-sm">
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={togglePlay}>
                        {isPlaying ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                        {isPlaying ? "Pause" : "Play"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={restart}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Replay
                    </Button>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <a href={src} download={`reliqa-run.webm`} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-1" />
                        Download
                    </a>
                </Button>
            </div>
        </div>
    );
}

