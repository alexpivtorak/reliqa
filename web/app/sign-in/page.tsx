'use client';

import { Suspense, useState, type FormEvent, type SVGProps } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function SignInForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo') || '/';
    const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/';
    const errorParam = searchParams.get('error');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(
        errorParam === 'access_denied'
            ? 'Your email is not on the allowlist. Ask an admin to add it to AUTH_ALLOWED_EMAILS.'
            : errorParam
                ? 'Sign-in failed. Please try again.'
                : null,
    );

    const isLoading = isPasswordLoading || isGoogleLoading;

    const handlePasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsPasswordLoading(true);
        setError(null);
        try {
            const result = await authClient.signIn.email({
                email: email.trim(),
                password,
                callbackURL: safeReturnTo,
            });

            if (result.error) {
                setError(result.error.message || 'Password sign-in failed.');
                setIsPasswordLoading(false);
                return;
            }

            router.replace(safeReturnTo);
            router.refresh();
        } catch (err) {
            console.error('Password sign-in failed', err);
            setError('Password sign-in failed. Please try again.');
            setIsPasswordLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsGoogleLoading(true);
        setError(null);
        try {
            await authClient.signIn.social({
                provider: 'google',
                callbackURL: safeReturnTo,
            });
        } catch (err) {
            console.error('Google sign-in failed', err);
            setError('Sign-in failed. Please try again.');
            setIsGoogleLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Sign in to Reliqa</CardTitle>
                <CardDescription>
                    Google for allowlisted humans. Email/password only for the seed agent account.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
                {error && (
                    <div
                        role="alert"
                        data-testid="sign-in-error"
                        className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                        {error}
                    </div>
                )}

                <form
                    onSubmit={handlePasswordSignIn}
                    className="flex flex-col gap-4"
                    data-testid="password-sign-in-form"
                >
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="username"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={isLoading}
                            data-testid="sign-in-email"
                            placeholder="agent@reliqa.local"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            minLength={8}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            disabled={isLoading}
                            data-testid="sign-in-password"
                        />
                    </div>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                        data-testid="sign-in-password-submit"
                        aria-label="Sign in with email and password"
                    >
                        {isPasswordLoading ? 'Signing in…' : 'Sign in with password'}
                    </Button>
                </form>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    data-testid="sign-in-google"
                    aria-label="Sign in with Google"
                >
                    <GoogleIcon aria-hidden="true" />
                    {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
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
