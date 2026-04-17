import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { useRestartWorker } from '@/lib/mutations';

export function RestartDialog(): JSX.Element {
  const [open, setOpen] = useState(false);
  const restart = useRestartWorker();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Restart worker</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restart worker?</DialogTitle>
          <DialogDescription>
            The worker process will exit and Docker will bring it back up in ~3s. The API is not
            affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={restart.isPending}
            onClick={() => {
              restart.mutate();
              setOpen(false);
            }}
          >
            {restart.isPending ? 'restarting…' : 'Restart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
