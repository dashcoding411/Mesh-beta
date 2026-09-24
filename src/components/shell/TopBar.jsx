import { ArrowLeft } from "lucide-react";
import IconButton from "../ui/IconButton";
import { goBack } from "../../lib/router";

/* The phone header. Each page supplies its own, because only the page knows
   what belongs there: Home puts the sidebar button and Create in it, a chat
   puts the person you're talking to. Hidden on desktop, where the sidebar
   already says where you are. */
export default function TopBar({ title, left, right, back, backTo = "/", transparent = false, desktop = false, sub }) {
  return (
    <header className={`${desktop ? "" : "md:hidden"} sticky top-0 z-nav shrink-0 pt-safe ${
      transparent ? "absolute inset-x-0 bg-gradient-to-b from-black/60 to-transparent text-white" : "border-b border-line bg-canvas/90 backdrop-blur"
    }`}>
      <div className="flex h-14 items-center gap-1 px-2">
        {back && <IconButton icon={ArrowLeft} label="Back" tone={transparent ? "overlay" : "ghost"} onClick={() => goBack(backTo)} />}
        {left}
        <div className={`min-w-0 flex-1 ${left || back ? "px-1" : "px-2"}`}>
          {typeof title === "string" ? <h1 className="truncate text-title-3">{title}</h1> : title}
        </div>
        {right && <div className="flex items-center">{right}</div>}
      </div>
      {sub}
    </header>
  );
}
