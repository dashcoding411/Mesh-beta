// Where a notification leads, shared by the Notifications page and the banner.
import { openPost, openUserProfile } from "./db";
import { openStory } from "./openStory";
import { navigate } from "./router";

export function openNotice(n) {
  if (["like", "repost", "comment", "reply", "mention"].includes(n.type) && n.postId) return openPost(n.postId);
  if (["family", "familyok", "familyask"].includes(n.type)) return navigate("/account/brick");
  if (n.type === "invite") return navigate(`/gatherings/${n.ref}`);
  if (n.type === "joined") return navigate(`/circles/${n.ref}`);
  if (n.type === "storylike" || n.type === "echo") return openStory(n.ref, { panel: "activity", tab: n.type === "echo" ? "echoes" : "viewers" });
  // Decisions come from Mesh, so they don't lead to the staff member who made them.
  if (n.type === "journalist") return navigate(n.text === "approved" ? "/news/desk" : "/account/settings?open=journalist");
  if (n.type === "appeal") return undefined;
  return openUserProfile(n.actorId);
}
