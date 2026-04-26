import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, CornerBrackets, Crest, Input, useToast } from '@zeno/ui';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
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
  const toast = useToast();
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
        toast.fail('invalid password');
      } else {
        toast.fail('unexpected error, try again');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative grid overflow-hidden"
      style={{
        minHeight: '100vh',
        placeItems: 'center',
        background: [
          'radial-gradient(ellipse 800px 500px at 50% 15%, rgba(217,179,98,0.10), transparent 60%)',
          'radial-gradient(ellipse 500px 300px at 50% 100%, rgba(122,166,232,0.04), transparent 60%)',
          'var(--color-canvas)',
        ].join(', '),
      }}
    >
      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(217,179,98,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(217,179,98,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 10%, transparent 70%)',
        }}
      />

      {/* Ceremonial losango aura */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: 640,
          height: 640,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%) rotate(45deg)',
          border: '1px solid rgba(217,179,98,0.08)',
        }}
      >
        <div
          className="absolute"
          style={{
            inset: 36,
            border: '1px solid rgba(217,179,98,0.04)',
          }}
        />
      </div>

      {/* Login card */}
      <form
        onSubmit={onSubmit}
        className="relative z-10 flex w-[440px] flex-col gap-6 border border-border-subtle bg-panel shadow-float"
        style={{
          padding: '44px 40px 32px',
          animation: 'login-enter 420ms ease-out both',
        }}
      >
        <CornerBrackets />

        {/* Crest */}
        <div className="flex justify-center text-gold" style={{ padding: '4px 0 0' }}>
          <Crest size={56} ornate />
        </div>

        {/* Title block */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
            zeno · agent console
          </span>
          <h1 className="font-serif text-[34px] leading-tight text-text-primary">
            Identify yourself.
          </h1>
          <p className="text-[13px] text-text-secondary" style={{ marginTop: 2 }}>
            Only the king speaks with the king.
          </p>
        </div>

        {/* Form group */}
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
          <div style={{ marginTop: 4 }}>
            <Button type="submit" variant="primary" disabled={submitting || password.length === 0}>
              {submitting ? 'authenticating…' : 'enter throne room ↵'}
            </Button>
          </div>
        </div>

        {/* Terminal strip */}
        <div
          className="flex items-center gap-2 border border-border-subtle bg-canvas font-mono text-[11px] text-text-secondary"
          style={{ marginTop: 4, padding: '10px 14px' }}
        >
          <span className="text-gold">$</span>
          <span>
            {submitting ? TERMINAL_MESSAGES[seq % TERMINAL_MESSAGES.length] : 'awaiting passphrase'}
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

        {/* Footer meta */}
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
