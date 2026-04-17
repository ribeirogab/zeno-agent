import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Input } from '@zeno/ui';
import { type FormEvent, type JSX, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiFetch<void>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('invalid password');
      } else {
        toast.error('unexpected error, try again');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-canvas p-16">
      <form
        onSubmit={onSubmit}
        className="flex w-[420px] flex-col gap-7 rounded-xl border border-border-subtle bg-panel p-10"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-3xl italic leading-none text-accent">Z</span>
          <span className="text-sm tracking-wide text-text-secondary">zeno</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl leading-tight text-text-primary">Welcome back.</h1>
          <p className="text-sm leading-5 text-text-secondary">
            Sign in to inspect Zeno, manage scheduled tasks, and review session history.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-xs font-medium uppercase tracking-wider text-text-secondary"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={submitting || password.length === 0}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}
