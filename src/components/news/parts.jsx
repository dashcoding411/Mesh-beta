import { AlertTriangle, Play, RefreshCw } from "lucide-react";
import { labelOf } from "../../lib/storyDoc";
import { formatDuration, fullTime, isoTime, plural, shortTime } from "../../lib/format";
import { newsTopicById } from "../../lib/interests";
import { isVideoStory, readMinutes } from "./text";
import Badge from "../ui/Badge";
import MediaImg from "../ui/MediaImg";

export function TopicLabel({ id, className = "" }) {
  const t = newsTopicById(id) || newsTopicById("world");
  return (
    <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-accent-text ${className}`}>
      <t.icon size={12} aria-hidden="true" /> {t.label}
    </span>
  );
}

/** Analysis, Explainer or Opinion (reports go unlabelled), so readers know what they're reading. */
export function KindBadge({ id }) {
  const kind = labelOf(id);
  if (!kind || kind.id === "report") return null;
  return <Badge tone={kind.id === "opinion" ? "warning" : "accent"}>{kind.label}</Badge>;
}

export function Meta({ item }) {
  const sources = (item.sources || []).length;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
      <span>{isVideoStory(item) ? `${formatDuration(item.videoSeconds)} video` : `${readMinutes(item.script)} min read`}</span>
      <span aria-hidden="true">·</span>
      <span>{plural(sources, "source")}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={isoTime(item.createdAt)} title={fullTime(item.createdAt)}>{shortTime(item.createdAt)}</time>
      {item.updateNoteAt && <Badge icon={RefreshCw}>Updated {shortTime(item.updateNoteAt)}</Badge>}
      {item.corrections?.length > 0 && <Badge tone="warning" icon={AlertTriangle}>Corrected</Badge>}
    </span>
  );
}

/** A story's picture for lists: the cover, or a video story's still with a play badge. */
export function StoryCover({ item, className, placeholderClass }) {
  const video = isVideoStory(item);
  // A graphic video's still isn't shown until someone chooses to watch.
  const src = item.graphic ? "" : item.coverUrl || (video ? item.videoPoster : "");
  if (!src && !video) return null;
  return (
    <span className={`relative block shrink-0 overflow-hidden ${placeholderClass}`}>
      {src ? <MediaImg src={src} alt="" loading="lazy" className={className} placeholderClass={placeholderClass} />
        : <span className={`block bg-fg ${placeholderClass}`} aria-hidden="true" />}
      {video && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-caption font-semibold text-white">
          <Play size={12} fill="currentColor" aria-hidden="true" />
          {item.videoSeconds > 0 ? formatDuration(item.videoSeconds) : "Video"}
        </span>
      )}
    </span>
  );
}
