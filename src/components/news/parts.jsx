import { AlertTriangle, RefreshCw } from "lucide-react";
import { labelOf } from "../../lib/storyDoc";
import { fullTime, isoTime, plural, shortTime } from "../../lib/format";
import { newsTopicById } from "../../lib/interests";
import { readMinutes } from "./text";
import Badge from "../ui/Badge";

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
      <span>{readMinutes(item.script)} min read</span>
      <span aria-hidden="true">·</span>
      <span>{plural(sources, "source")}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={isoTime(item.createdAt)} title={fullTime(item.createdAt)}>{shortTime(item.createdAt)}</time>
      {item.updateNoteAt && <Badge icon={RefreshCw}>Updated {shortTime(item.updateNoteAt)}</Badge>}
      {item.corrections?.length > 0 && <Badge tone="warning" icon={AlertTriangle}>Corrected</Badge>}
    </span>
  );
}
