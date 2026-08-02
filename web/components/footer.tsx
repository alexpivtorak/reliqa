import Link from 'next/link';
import { Github, ShieldCheck } from 'lucide-react';

export function Footer() {
    return (
        <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex flex-col items-center justify-between gap-4 py-6 md:h-16 md:flex-row md:py-0 px-16">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Built by{" "}
                        <Link
                            href="/"
                            className="font-medium text-foreground/80 transition-colors hover:text-foreground"
                        >
                            Reliqa Team
                        </Link>
                    </span>
                </div>

                <div className="flex items-center gap-5">
                    <Link href="/roadmap" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        Roadmap
                    </Link>
                    <Link href="/docs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        Documentation
                    </Link>
                    <a
                        href="https://github.com/alexpivtorak/reliqa"
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Github className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </footer>
    );
}
