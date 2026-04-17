import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '../src/index.js';

function DestructiveModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>remover?</AlertDialogTitle>
          <AlertDialogDescription>não pode desfazer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">cancelar</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="accent" onClick={onConfirm}>
              remover
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('AlertDialog', () => {
  it('renders only the trigger initially', () => {
    render(<DestructiveModal onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    expect(screen.queryByText('remover?')).toBeNull();
  });

  it('opens on trigger click and shows title + description', async () => {
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('remover?')).toBeDefined();
    expect(screen.getByText('não pode desfazer.')).toBeDefined();
  });

  it('calls onConfirm when the accent action is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'remover' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without calling onConfirm on cancel', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
