import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { CronForm } from '@/components/crons/cron-form';
import { useCreateCron } from '@/lib/mutations';

export const Route = createFileRoute('/_authed/crons/new')({
  component: NewCronPage,
});

function NewCronPage(): JSX.Element {
  const navigate = useNavigate();
  const create = useCreateCron();

  const onOpenChange = (open: boolean): void => {
    if (!open) void navigate({ to: '/crons' });
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New cron</DialogTitle>
          <DialogDescription>Scheduled task that runs through the agent.</DialogDescription>
        </DialogHeader>
        <CronForm
          submitting={create.isPending}
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
