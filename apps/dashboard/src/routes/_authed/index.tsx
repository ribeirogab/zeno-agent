import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';

export const Route = createFileRoute('/_authed/')({
  component: HomePage,
});

function HomePage(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="font-serif text-4xl">Home (TODO Task 5.8)</div>
    </div>
  );
}
