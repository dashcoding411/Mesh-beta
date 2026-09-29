import Avatar from "./Avatar";
import { useLiveCard } from "../../lib/profileCache";

/* An avatar for someone's post, comment or notification that shows their
   photo as it is now, not as it was when they wrote it. */
export default function LiveAvatar({ uid, profile, size, ring, className }) {
  const live = useLiveCard(uid, profile);
  return <Avatar profile={live} size={size} ring={ring} className={className} />;
}
