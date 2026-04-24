import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  CornerBrackets,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogSubtitle,
  DialogTitle,
} from '@zeno/ui';
import type { JSX } from 'react';
import { CronForm } from '@/components/crons/cron-form';
import { IcoX } from '@/components/icons';
import { useCreateCron } from '@/lib/mutations';

export const Route = createFileRoute('/_authed/crons/new')({
  component: NewCronPage,
});

function NewCronPage(): JSX.Element {
  const navigate = useNavigate();
  const create = useCreateCron();

  const close = (): void => {
    void navigate({ to: '/crons' });
  };

  const onOpenChange = (open: boolean): void => {
    if (!open) close();
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <CornerBrackets />
        <DialogHeader>
          <div>
            <DialogSubtitle>new scheduled task</DialogSubtitle>
            <DialogTitle>Commission a new cron.</DialogTitle>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center border border-border-subtle bg-transparent text-text-secondary transition-all duration-[120ms] hover:border-gold-line hover:text-gold"
            >
              <IcoX size={12} />
            </button>
          </DialogClose>
        </DialogHeader>
        <CronForm
          submitting={create.isPending}
          onCancel={close}
          onSubmit={(input) => {
            create.mutate(input, {
              onSuccess: () => void navigate({ to: '/crons' }),
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
