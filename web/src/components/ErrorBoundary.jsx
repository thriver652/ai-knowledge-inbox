import { Component } from 'react';

// Contains a render crash to one panel instead of blanking the whole app.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        This panel hit an unexpected error.{' '}
        <button type="button" className="underline" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
