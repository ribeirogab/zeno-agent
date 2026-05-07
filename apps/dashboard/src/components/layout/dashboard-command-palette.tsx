import { useNavigate } from '@tanstack/react-router';
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  CommandShortcut,
} from '@zeno/ui';
import { type JSX, useEffect, useState } from 'react';

/**
 * Global command palette mounted from `_authed.tsx`. Listens for ⌘K (or Ctrl+K
 * on non-mac) to toggle. Items are navigation shortcuts; selecting an item
 * navigates and closes the palette.
 *
 * Add new items by appending to the `NAV_ITEMS` / `ACTIONS` arrays below.
 */
export function DashboardCommandPalette(): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goto = (to: string): void => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <CommandPalette open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="search · navigate · run command…" />
      <CommandList>
        <CommandEmpty>no matches.</CommandEmpty>
        <CommandGroup heading="navigate">
          <CommandItem value="home dashboard" onSelect={() => goto('/')}>
            <span>home</span>
            <CommandShortcut>⌘H</CommandShortcut>
          </CommandItem>
          <CommandItem value="crons schedules tasks" onSelect={() => goto('/crons')}>
            <span>crons</span>
            <CommandShortcut>⌘C</CommandShortcut>
          </CommandItem>
          <CommandItem value="sessions threads slack" onSelect={() => goto('/sessions')}>
            <span>sessions</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="connectors mcp tools integrations"
            onSelect={() => goto('/connectors')}
          >
            <span>connectors</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem value="logs observability pino" onSelect={() => goto('/logs')}>
            <span>logs</span>
            <CommandShortcut>⌘L</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings system mcp profile" onSelect={() => goto('/settings')}>
            <span>settings</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandPalette>
  );
}
