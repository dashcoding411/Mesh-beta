import Avatar from "./Avatar";
import { useLiveCard } from "../../lib/profileCache";

export default function LiveAvatar({ uid, profile, size, ring, className }) {
  const live = useLiveCard(uid, profile);
  return <Avatar profile={live} size={size} ring={ring} className={className} />;
}
