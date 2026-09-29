import { useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { useShell } from "./shell/ShellContext";
import { useProfilePhoto } from "../lib/useProfilePhoto";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { Spinner } from "./ui/States";

/* Your own avatar, as the button that changes it. With no photo it says
   so plainly ("Add photo", with a dashed ring); with one, a camera badge. */
export function EditableAvatar({ size = 88 }) {
  const { profile } = useShell();
  const photo = useProfilePhoto();
  return (
    <span className="flex shrink-0 flex-col items-center gap-1.5">
      <button type="button" onClick={photo.choose} disabled={photo.busy}
        aria-label={photo.hasPhoto ? "Change profile photo" : "Add a profile photo"}
        className={`press relative rounded-full ${photo.hasPhoto ? "" : "outline-dashed outline-2 outline-offset-4 outline-accent-text"}`}>
        <Avatar profile={profile} size={size} />
        {!photo.hasPhoto && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white" aria-hidden="true">
            <ImagePlus size={Math.round(size / 3)} />
          </span>
        )}
        <span aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-canvas bg-accent text-white">
          {photo.busy ? <Spinner size={14} /> : <Camera size={15} />}
        </span>
      </button>
      {!photo.hasPhoto && <span className="text-label font-semibold text-accent-text" aria-hidden="true">Add photo</span>}
      <input {...photo.inputProps} />
    </span>
  );
}

/* A reminder to add a photo, for accounts that don't have one. On Home it
   can be dismissed for good on this device. */
export function PhotoNudge({ dismissible = false, className = "" }) {
  const { profile } = useShell();
  const photo = useProfilePhoto();
  const key = `mesh:photo-nudge:${profile?.id}`;
  const [hidden, setHidden] = useState(() => {
    try { return dismissible && localStorage.getItem(key) === "1"; } catch { return false; }
  });
  if (photo.hasPhoto || hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(key, "1"); } catch { /* storage blocked: it just comes back next visit */ }
    setHidden(true);
  };
  return (
    <div role="note" className={`flex items-center gap-3 rounded-card border border-accent-text/30 bg-accent-soft p-3 ${className}`}>
      <Avatar profile={profile} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-callout font-semibold text-fg">Add a profile photo</p>
        <p className="text-caption text-fg-muted">People recognise you faster in feeds, comments and chats.</p>
      </div>
      <Button size="sm" variant="primary" icon={Camera} loading={photo.busy} onClick={photo.choose}>Add</Button>
      {dismissible && (
        <button type="button" onClick={dismiss} aria-label="Not now"
          className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <X size={16} aria-hidden="true" />
        </button>
      )}
      <input {...photo.inputProps} />
    </div>
  );
}

/* The photo section at the top of Edit profile. */
export function PhotoField() {
  const { profile } = useShell();
  const photo = useProfilePhoto();
  return (
    <div className="flex items-center gap-4">
      <Avatar profile={profile} size={64} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Camera} loading={photo.busy} onClick={photo.choose}>{photo.hasPhoto ? "Change photo" : "Add photo"}</Button>
        {photo.hasPhoto && <Button size="sm" variant="ghost" disabled={photo.busy} onClick={photo.remove}>Remove</Button>}
      </div>
      <input {...photo.inputProps} />
    </div>
  );
}
