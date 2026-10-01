// The first-run tour (components/Tour.jsx) starts again on this event.
import { navigate } from "./router";

export const TOUR_EVENT = "mesh:tour";

/** Replay the tour: it runs on the Home feed. */
export function replayTour() {
  navigate("/");
  setTimeout(() => window.dispatchEvent(new CustomEvent(TOUR_EVENT)), 50);
}
