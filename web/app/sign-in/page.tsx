'use client';

import { Suspense, useState, type SVGProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SignInForm() {
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo') || '/';
    const errorParam = searchParams.get('error');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(
        errorParam === 'access_denied'
            ? 'Your email is not on the allowlist. Ask an admin to add it to AUTH_ALLOWED_EMAILS.'
            : errorParam
                ? 'Sign-in failed. Please try again.'
                : null,
    );

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await authClient.signIn.social({
                provider: 'google',
                callbackURL: returnTo.startsWith('/') ? returnTo : '/',
            });
        } catch (err) {
            console.error('Google sign-in failed', err);
            setError('Sign-in failed. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Sign in to Reliqa</CardTitle>
                <CardDescription>
                    Use your Google account. Only allowlisted emails can sign up.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {error && (
                    <div
                        role="alert"
                        className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                        {error}
                    </div>
                )}
                <Button
                    type="button"
                    className="w-full gap-2"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    aria-label="Sign in with Google"
                >
                    <GoogleIcon aria-hidden="true" />
                    {isLoading ? 'Redirecting…' : 'Continue with Google'}
                </Button>
            </CardContent>
        </Card>
    );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" {...props}>
            <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
        </svg>
    );
}

export default function SignInPage() {
    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
                <SignInForm />
            </Suspense>
        </div>
    );
}
