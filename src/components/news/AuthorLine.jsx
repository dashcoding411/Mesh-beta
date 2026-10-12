// The compact byline on story cards, kept apart from the journalist pages
// so the feed doesn't load them.
import { outletOf, useJournalist } from "../../lib/journalists";
import { useLiveCard } from "../../lib/profileCache";
import LiveAvatar from "../ui/LiveAvatar";
import MediaImg from "../ui/MediaImg";
import { VerifiedTick } from "../ui/Badges";

/** The outlet's logo, or the journalist's photo when they have none. */
export function Mark({ uid, journalist, username, size }) {
  if (journalist?.logoUrl) {
    return (
      <span className="shrink-0 overflow-hidden rounded-[22%] bg-surface-2" style={{ width: size, height: size }}>
        <MediaImg src={journalist.logoUrl} alt="" className="h-full w-full object-cover" placeholderClass="h-full w-full" />
      </span>
    );
  }
  return <LiveAvatar uid={uid} profile={{ username }} size={size} />;
}

/** Compact byline for story cards: the lead author and their outlet. */
export function AuthorLine({ item }) {
  const uid = item.authorId;
  const username = (item.authorNames || [item.authorName])[0];
  const journalist = useJournalist(uid);
  const card = useLiveCard(uid, { username });
  const more = (item.authors || [uid]).length - 1;
  return (
    <span className="flex min-w-0 items-center gap-2 text-caption text-fg-muted">
      <Mark uid={uid} journalist={journalist} username={username} size={20} />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-fg">{card.name || `@${username}`}</span>
        {journalist && <VerifiedTick size={13} label="Verified journalist" className="ml-0.5 align-[-2px]" />}
        {more > 0 && ` and ${more} more`}
        <span className="text-fg-subtle"> · {outletOf(journalist)}</span>
        {journalist?.affiliation && <span className="text-warning-text"> · {journalist.affiliation}</span>}
      </span>
    </span>
  );
}
