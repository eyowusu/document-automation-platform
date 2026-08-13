'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? 'Could not sign in');
        setIsSubmitting(false);
        return;
      }
      // Stays disabled past this point: navigation is under way.
      // refresh() makes the server re-read the new session cookie.
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-yellow-400 to-green-600" />

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <ShieldCheck className="size-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Document Automation Platform
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ghana School Feeding Programme — National Secretariat
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="username"
                required
                autoFocus
                placeholder="name@gsfp.gov.gh"
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="w-full"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Lock className="size-3.5" />
            Authorised officers only. Activity is recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
