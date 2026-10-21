import { Component, useState, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this changes (the route), the boundary tries again. */
  resetKey?: string;
  /** Go to the Lists screen (inside the router); without it the page loads /lists. */
  onHome?: () => void;
  /** The whole app failed: fill the screen. */
  root?: boolean;
}

interface State {
  error?: Error;
  info?: string;
  key?: string;
}

/** Text to paste into a bug report. */
function details(error: Error, componentStack?: string): string {
  return [
    `${error.name}: ${error.message}`,
    `Page: ${location.pathname}${location.search}`,
    `When: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    '',
    error.stack ?? '',
    componentStack ? `\nComponents:${componentStack}` : '',
  ].join('\n');
}

function Fallback({ error, info, root, onHome }: { error: Error; info?: string; root?: boolean; onHome: () => void }) {
  const [copied, setCopied] = useState<'' | 'yes' | 'no'>('');
  const text = details(error, info);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };
  return (
    <main className="screen" style={root ? { minHeight: '100vh' } : undefined}>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>Something went wrong</div>
          <div className="small muted">This screen hit an error. Your lists and games are saved — reloading or going back to Lists usually helps.</div>
          <div className="small muted" style={{ wordBreak: 'break-word' }}>
            {error.message}
          </div>
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Reload
            </button>
            <button className="btn" onClick={onHome}>
              Go to Lists
            </button>
            <button className="btn btn-ghost" onClick={copy}>
              Copy error details
            </button>
          </div>
          {copied === 'yes' && <div className="small">Copied. Paste it into a bug report.</div>}
          {copied === 'no' && <textarea className="input" readOnly value={text} rows={6} aria-label="Error details" onFocus={(e) => e.currentTarget.select()} />}
        </div>
      </div>
    </main>
  );
}

/** Shows "Something went wrong" instead of a blank app when a screen fails to draw. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new route gets a fresh try.
    if (props.resetKey !== state.key) return { key: props.resetKey, error: state.key === undefined ? state.error : undefined, info: undefined };
    return null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? undefined });
    console.error(error);
  }

  private home = () => {
    this.setState({ error: undefined, info: undefined });
    if (this.props.onHome) this.props.onHome();
    else location.assign(`${import.meta.env.BASE_URL}lists`);
  };

  render() {
    if (this.state.error) return <Fallback error={this.state.error} info={this.state.info} root={this.props.root} onHome={this.home} />;
    return this.props.children;
  }
}
