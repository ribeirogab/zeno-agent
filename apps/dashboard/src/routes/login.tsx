import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, CornerBrackets, Crest, Input } from '@zeno/ui';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

const TERMINAL_MESSAGES = [
  'handshake · ok',
  'hmac · validating…',
  'session · bound',
  'throne room · opening',
];

function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (!submitting) return;
    const id = setInterval(() => setSeq((s) => s + 1), 140);
    return () => clearInterval(id);
  }, [submitting]);

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
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: [
          'radial-gradient(ellipse 800px 500px at 50% 0%, rgba(217,179,98,0.10), transparent 70%)',
          'radial-gradient(ellipse 600px 400px at 50% 100%, rgba(122,166,232,0.04), transparent 70%)',
          'var(--color-canvas)',
        ].join(', '),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black, transparent)',
        }}
      />

      <div
        className="pointer-events-none absolute"
        style={{
          width: 640,
          height: 640,
          transform: 'rotate(45deg)',
          border: '1px solid rgba(217,179,98,0.08)',
        }}
      >
        <div className="absolute inset-[36px] border border-gold-line" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative z-10 flex w-[440px] flex-col gap-6 border border-border-subtle bg-panel p-10 shadow-float"
        style={{
          animation: 'login-enter 420ms ease-out both',
        }}
      >
        <CornerBrackets />

        <div className="flex justify-center text-gold">
          <Crest size={56} ornate />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
            zeno · agent console
          </span>
          <h1 className="font-serif text-[34px] leading-tight text-text-primary">
            Identify yourself.
          </h1>
          <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">
            Only the king speaks with the king.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
            >
              password
            </label>
            <Input
              id="password"
              type="password"
              autoFocus
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || password.length === 0}
            className="w-full"
          >
            {submitting ? 'authenticating…' : 'enter throne room ↵'}
          </Button>
        </div>

        <div className="flex items-center gap-2 border border-border-subtle bg-canvas px-3 py-2 font-mono text-[11px] text-text-secondary">
          <span className="text-text-tertiary">$</span>
          <span>
            {submitting
              ? TERMINAL_MESSAGES[seq % TERMINAL_MESSAGES.length]
              : 'awaiting passphrase'}
          </span>
          <span
            className="ml-auto inline-block shrink-0 bg-gold"
            style={{
              width: 7,
              height: 13,
              animation: 'cursor-blink 1s steps(2) infinite',
            }}
          />
        </div>

        <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] text-text-tertiary">
          <span>ip · 10.0.0.14</span>
          <span>last seen · 4h ago</span>
          <span>zeno · v0.3.1</span>
        </div>
      </form>

      <style>{`
        @keyframes login-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
