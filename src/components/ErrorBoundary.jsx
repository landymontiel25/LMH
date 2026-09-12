import { Component } from 'react';

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
        <h1 className="screen-title">{'\u{26A0}\u{FE0F}'} Something went wrong</h1>
        <p className="screen-subtitle">
          This screen hit an unexpected error. Try again, or head back to the map.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => this.setState({ error: null })}>
          Try Again
        </button>
        <a href="#/" className="btn btn-ghost btn-block" style={{ marginTop: 10, display: 'block', textAlign: 'center' }}>
          Back to Map
        </a>
      </div>
    );
  }
}
