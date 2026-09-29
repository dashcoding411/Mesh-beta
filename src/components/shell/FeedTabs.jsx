import Tabs from "../ui/Tabs";
import { FEED_TABS } from "../../lib/surfaces";
import { navigate } from "../../lib/router";
import { scrollOrRefresh } from "./scrollOrRefresh";

/* For you · Following, across the top of the feed. Switching is a
   navigation (each has its own URL), so Back steps between them. Tapping
   the one you're on scrolls up, or refreshes when you're at the top. */
export default function FeedTabs({ value }) {
  return (
    <Tabs variant="underline" label="Feeds" className="px-2 md:px-4" value={value}
      onChange={(id) => (id === value ? scrollOrRefresh() : navigate(FEED_TABS.find((t) => t.id === id).path))}
      tabs={FEED_TABS.map((t) => ({ id: t.id, label: t.label }))} />
  );
}
