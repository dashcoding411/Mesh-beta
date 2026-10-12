import { Newspaper, Radio } from "lucide-react";
import { navigate } from "../../lib/router";
import { AuthorLine } from "./AuthorLine";
import { KindBadge, Meta, TopicLabel } from "./parts";
import { summaryOf } from "./text";
import Badge from "../ui/Badge";
import MediaImg from "../ui/MediaImg";

/** A story from a journalist the viewer follows, in the Home feed. */
export default function NewsFeedCard({ story }) {
  return (
    <article aria-labelledby={`feed-news-${story.id}`}
      className="pb-3 pt-3.5 md:rounded-card md:border md:border-line md:bg-surface">
      <p className="mb-2.5 flex items-center gap-1.5 px-4 text-caption font-medium text-fg-subtle">
        <Newspaper size={14} aria-hidden="true" /> News from a journalist you follow
      </p>
      <div className="px-4"><AuthorLine item={story} /></div>
      <button type="button" onClick={() => navigate(`/news/${story.id}`)} className="press group mt-3 block w-full text-left">
        {story.coverUrl && (
          <MediaImg src={story.coverUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover"
            placeholderClass="aspect-[16/9] w-full" />
        )}
        <span className="block px-4 pt-3">
          <span className="flex flex-wrap items-center gap-2 text-label">
            <KindBadge id={story.label} />
            <TopicLabel id={story.topic} />
            {story.live && <Badge tone="danger" icon={Radio}>Live</Badge>}
          </span>
          <h3 id={`feed-news-${story.id}`} className="mt-1.5 font-display text-title-2 leading-snug decoration-fg-subtle underline-offset-4 group-hover:underline">
            {story.title}
          </h3>
          <span className="mt-1.5 line-clamp-3 block text-body text-fg-muted">{summaryOf(story)}</span>
          <span className="mt-2.5 block"><Meta item={story} /></span>
        </span>
      </button>
    </article>
  );
}
