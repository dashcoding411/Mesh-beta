import { Component } from "react";
import { RotateCw } from "lucide-react";
import Button from "./ui/Button";
import { ErrorState } from "./ui/States";
import { LogoMark } from "./ui/LogoMark";

// A page's code that didn't arrive: the connection dropped, or Mesh was
// updated while this tab was open and UpdateBanner's own reload didn't
// happen. React won't ask for it again, so only a reload gets it.
const NOT_LOADED = /dynamically imported module|module script|Failed to fetch|Unable to preload/i;

/**
 * Catches a crash while a screen is being drawn, so it can't leave a blank
 * page. Around the whole app it offers a reload. With `page`, the menus stay
 * and only the page's area shows the message; it clears when `resetKey`
 * (the address) changes or "Try again" is pressed.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey === state.key) return null;
    return { error: null, key: props.resetKey };
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const notLoaded = NOT_LOADED.test(String(error?.message || error));
    const title = notLoaded ? "Couldn't load this page" : "Something went wrong";
    const body = notLoaded
      ? "Check your connection, then reload. If Mesh has just been updated, that gets you the new version."
      : this.props.page
        ? "That's a problem on our side, not yours. If it keeps happening, reload Mesh."
        : "That's a problem on our side, not yours. Reloading usually fixes it.";
    const reload = () => window.location.reload();
    if (this.props.page) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <ErrorState title={title} body={body} onRetry={notLoaded ? reload : () => this.setState({ error: null })} />
        </div>
      );
    }
    return (
      <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <LogoMark size={56} />
        <p className="text-title-3 text-fg">{title}</p>
        <p className="max-w-xs text-callout text-fg-muted">{body}</p>
        <Button variant="primary" icon={RotateCw} onClick={reload}>Reload Mesh</Button>
      </div>
    );
  }
}
