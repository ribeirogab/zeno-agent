import { Component, type ReactNode } from 'react';

interface State {
  hasError: boolean;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export class LazyErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // No-op — error already in state. The fallback offers a manual reload.
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex-1 p-6 text-text-secondary">
            Failed to load graph view.{' '}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="underline text-gold"
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
