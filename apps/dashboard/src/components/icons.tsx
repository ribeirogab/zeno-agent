import type { JSX, SVGProps } from 'react';

interface IcoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Ico({
  size = 14,
  children,
  ...rest
}: IcoProps & { children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IcoHome(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </Ico>
  );
}

export function IcoCron(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9 2h6" />
    </Ico>
  );
}

export function IcoSessions(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M4 6h16v10H9l-5 4z" />
    </Ico>
  );
}

export function IcoLogs(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h16" />
    </Ico>
  );
}

export function IcoSettings(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .4 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.4 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.4-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Ico>
  );
}

export function IcoSearch(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Ico>
  );
}

export function IcoPlus(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M12 5v14M5 12h14" />
    </Ico>
  );
}

export function IcoPlay(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <polygon points="6 4 20 12 6 20 6 4" />
    </Ico>
  );
}

export function IcoPause(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </Ico>
  );
}

export function IcoTrash(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
    </Ico>
  );
}

export function IcoX(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Ico>
  );
}

export function IcoChevRight(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="m9 6 6 6-6 6" />
    </Ico>
  );
}

export function IcoChevDown(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="m6 9 6 6 6-6" />
    </Ico>
  );
}

export function IcoRefresh(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </Ico>
  );
}

export function IcoAlert(props: IcoProps): JSX.Element {
  return (
    <Ico {...props}>
      <path d="M12 2 2 20h20z" />
      <path d="M12 9v5M12 17v.5" />
    </Ico>
  );
}
