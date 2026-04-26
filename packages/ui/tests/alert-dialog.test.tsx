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
          <AlertDialogTitle>delete?</AlertDialogTitle>
          <AlertDialogDescription>cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="accent" onClick={onConfirm}>
              delete
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
    expect(screen.queryByText('delete?')).toBeNull();
  });

  it('opens on trigger click and shows title + description', async () => {
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('delete?')).toBeDefined();
    expect(screen.getByText('cannot be undone.')).toBeDefined();
  });

  it('calls onConfirm when the accent action is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without calling onConfirm on cancel', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DestructiveModal onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
