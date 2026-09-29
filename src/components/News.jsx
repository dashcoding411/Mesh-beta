import { useEffect } from "react";
import { navigate, useLocation } from "../lib/router";
import { NewsHome } from "./news/NewsHome";
import { NewsStory } from "./news/NewsStory";
import Newsroom from "./news/Newsroom";
import StoryEditor from "./news/StoryEditor";

/* News is its own place, with its own rules: every story names its sources,
   and a person checks it against them before it's published. The page is
   careful to say what review is and isn't: it's not a guarantee of truth. */
export default function News({ storyId, view }) {
  const loc = useLocation();
  const legacy = loc.query.get("story");
  // Old links were /news?story=id; they now have a page of their own.
  useEffect(() => {
    if (legacy && !storyId) navigate(`/news/${encodeURIComponent(legacy)}`, { replace: true });
  }, [legacy, storyId]);
  if (view === "desk") return <Newsroom />;
  if (view === "write") return <StoryEditor key={storyId} id={storyId} />;
  return storyId ? <NewsStory id={storyId} /> : <NewsHome />;
}
