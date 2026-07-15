import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {

  name?: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? ` - ${this.props.name}` : ""}]`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="errorBoundaryFallback">
          <div className="errorBoundaryIcon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="errorBoundaryTitle">
            {this.props.name ? `${this.props.name}加载出错` : "页面加载出错"}
          </div>
          <div className="errorBoundaryMessage">
            {this.state.error?.message || "发生了意外错误"}
          </div>
          <button className="errorBoundaryRetry" onClick={this.handleRetry}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
