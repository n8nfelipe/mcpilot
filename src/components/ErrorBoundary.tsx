import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const label = this.props.name || "This panel";
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <p className="text-sm font-medium text-destructive mb-1">{label} crashed</p>
          <p className="text-xs text-muted-foreground mb-3 max-w-xs truncate">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReset}
            className="text-xs text-primary hover:text-primary/80 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
