'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Ghost, Play, LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function MainNav() {
    const pathname = usePathname();
    const { data: session, isPending } = authClient.useSession();

    const links = [
        { href: '/', label: 'Missions', icon: Ghost },
        { href: '/new', label: 'New Mission', icon: Play },
    ];

    const handleSignOut = async () => {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    window.location.href = '/sign-in';
                },
            },
        });
    };

    return (
        <nav
            className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50"
            aria-label="Main"
        >
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

                {session && (
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
                                    <Icon className="w-4 h-4" aria-hidden="true" />
                                    {link.label}
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                {isPending ? (
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse" aria-hidden="true" />
                ) : session?.user ? (
                    <>
                        <div className="flex items-center gap-2">
                            {session.user.image ? (
                                <img
                                    src={session.user.image}
                                    alt=""
                                    className="h-8 w-8 rounded-full"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div
                                    className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500"
                                    aria-hidden="true"
                                />
                            )}
                            <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[10rem]">
                                {session.user.name || session.user.email}
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2"
                            onClick={handleSignOut}
                            aria-label="Sign out"
                        >
                            <LogOut className="w-4 h-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Sign out</span>
                        </Button>
                    </>
                ) : (
                    <Button asChild variant="outline" size="sm">
                        <Link href="/sign-in">Sign in</Link>
                    </Button>
                )}
            </div>
        </nav>
    );
}
