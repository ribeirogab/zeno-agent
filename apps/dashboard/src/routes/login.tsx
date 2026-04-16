import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-text-secondary">login (TODO Task 5.6)</div>
    </div>
  );
}
