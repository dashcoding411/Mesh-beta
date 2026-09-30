import { useEffect, useState } from "react";

/** True once `ref` has come within 200px of the viewport. Used to defer per-post reads. */
export function useInView(ref) {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}
