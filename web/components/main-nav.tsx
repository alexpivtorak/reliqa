'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Ghost, Play, FileClock, Settings } from 'lucide-react';

export function MainNav() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Missions', icon: Ghost },
        { href: '/new', label: 'New Mission', icon: Play },
        // { href: '/history', label: 'History', icon: FileClock }, // Future
        // { href: '/settings', label: 'Settings', icon: Settings }, // Future
    ];

    return (
        <nav className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center mr-4 transition-opacity hover:opacity-80">
                    <img
                        src="/reliqa-logo.svg"
                        alt="Reliqa"
                        width={97}
                        height={28}
                        className="h-7 w-auto"
                    />
                </Link>

                <div className="flex items-center gap-4 text-sm font-medium">
                    {links.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center gap-2 transition-colors hover:text-foreground/80",
                                    isActive ? "text-foreground" : "text-foreground/60"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {link.label}
                            </Link>
                        )
                    })}
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* User profile or status could go here */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500"></div>
            </div>
        </nav>
    );
}
