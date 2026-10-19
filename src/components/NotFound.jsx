import { Compass, Home, Search } from "lucide-react";
import { navigate } from "../lib/router";
import { usePageTitle } from "../lib/usePageTitle";
import Button from "./ui/Button";

export default function NotFound() {
  usePageTitle("Page not found", 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
        <Compass size={26} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-title-1">This page doesn't exist</h1>
      <p className="mt-2 max-w-sm text-callout text-fg-muted">
        The link may be mistyped or out of date.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={Home} onClick={() => navigate("/", { replace: true })}>Go to Home</Button>
        <Button icon={Search} onClick={() => navigate("/search", { replace: true })}>Search Mesh</Button>
      </div>
    </div>
  );
}
