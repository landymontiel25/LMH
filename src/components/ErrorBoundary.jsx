import { Component } from 'react';
import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';

// Catches a render-time crash in whatever screen is mounted inside it (this
// wraps just <Routes>, not Header/BottomNav -- see App.jsx) so one bad
// component blanks that screen instead of the entire app, and the user can
// still navigate somewhere else via the nav that's still on screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No crash-reporting service wired up yet -- at minimum this keeps the
    // real error visible in the console instead of vanishing with the UI.
    console.error('Uncaught render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: '24px 20px' }}>
        <h1 className="screen-title"><TriangleAlertIcon aria-hidden="true" /> Something went wrong</h1>
        <p className="screen-subtitle">
          This screen hit an unexpected error. Try again, or head back to the map.
        </p>
        {/* A full reload, not just clearing local state: the most common
            real cause here is a stale JS chunk reference from before the
            latest deploy (this project ships often), and re-rendering the
            same crashed subtree just re-fetches that same now-missing file
            and fails again identically. Reloading fetches the current
            index.html with correct chunk references, which actually fixes
            it -- clearing state can't. */}
        <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>
          Try Again
        </button>
        <a href="#/" className="btn btn-ghost btn-block" style={{ marginTop: 10, display: 'block', textAlign: 'center' }}>
          Back to Map
        </a>
      </div>
    );
  }
}
