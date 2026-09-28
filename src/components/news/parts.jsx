// Small pieces shared by the news pages: the topic label and the meta line.
import { AlertTriangle } from "lucide-react";
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

export function Meta({ item }) {
  const sources = (item.sources || []).length;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
      <span>{readMinutes(item.script)} min read</span>
      <span aria-hidden="true">·</span>
      <span>{plural(sources, "source")}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={isoTime(item.createdAt)} title={fullTime(item.createdAt)}>{shortTime(item.createdAt)}</time>
      {item.corrections?.length > 0 && <Badge tone="warning" icon={AlertTriangle}>Corrected</Badge>}
    </span>
  );
}
