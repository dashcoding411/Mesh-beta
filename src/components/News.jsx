import { useEffect } from "react";
import { navigate, useLocation } from "../lib/router";
import { NewsHome } from "./news/NewsHome";
import { NewsStory } from "./news/NewsStory";
import Newsroom from "./news/Newsroom";
import StoryEditor from "./news/StoryEditor";

export default function News({ storyId, view }) {
  const loc = useLocation();
  const legacy = loc.query.get("story");
  // Legacy /news?story=id links.
  useEffect(() => {
    if (legacy && !storyId) navigate(`/news/${encodeURIComponent(legacy)}`, { replace: true });
  }, [legacy, storyId]);
  if (view === "desk") return <Newsroom />;
  if (view === "write") return <StoryEditor key={storyId} id={storyId} />;
  return storyId ? <NewsStory id={storyId} /> : <NewsHome />;
}
