import { Button } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
            O processo do worker vai sair e o Docker vai subir de novo em ~3s. A API não é afetada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="accent"
            disabled={restart.isPending}
            onClick={() => {
              restart.mutate();
              setOpen(false);
            }}
          >
            {restart.isPending ? 'reiniciando…' : 'Restart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
