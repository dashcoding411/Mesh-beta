import { useRef, useState } from "react";
import { removeAvatar, StorageUnavailableError, uploadAvatar } from "./db";
import { primeCard } from "./profileCache";
import { useShell } from "../components/shell/ShellContext";
import { useToast } from "../components/ui/toast-context";

/* Adding, changing or removing your profile photo, from anywhere that
   offers it (your profile, Edit profile, the reminder on Home). Render an
   <input type="file" {...inputProps} /> and call choose() to open it. */
export function useProfilePhoto() {
  const { profile, setProfile } = useShell();
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const apply = (photoURL) => {
    const next = { ...profile, photoURL };
    setProfile(next);
    primeCard(profile.id, next);
  };

  const onChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast({ tone: "error", title: "Choose an image for your profile photo" });
    setBusy(true);
    try {
      apply(await uploadAvatar(file));
      toast({ title: "Profile photo updated", body: "It shows on your posts, comments and messages." });
    } catch (err) {
      toast({
        tone: "error",
        title: err instanceof StorageUnavailableError ? "Photo uploads aren't switched on yet" : "Couldn't update your photo",
        body: err instanceof StorageUnavailableError ? "They need Firebase Cloud Storage (Blaze plan)." : "Try a smaller image, or try again in a moment.",
      });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await removeAvatar(); apply(""); toast({ title: "Photo removed" }); }
    catch { toast({ tone: "error", title: "Couldn't remove your photo" }); }
    finally { setBusy(false); }
  };

  return {
    busy,
    hasPhoto: !!profile?.photoURL,
    choose: () => ref.current?.click(),
    remove,
    inputProps: { ref, type: "file", accept: "image/*", className: "hidden", tabIndex: -1, "aria-hidden": true, onChange },
  };
}
