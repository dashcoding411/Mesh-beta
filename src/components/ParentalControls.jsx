import { Info, Lock, ShieldCheck, Users } from "lucide-react";
import { useShell } from "./shell/ShellContext";
import { useBrick } from "../lib/useBrick";
import { usePageTitle } from "../lib/usePageTitle";
import TopBar from "./shell/TopBar";
import { FamilySection } from "./BrickSettings";

const HOW = [
  { icon: Users, title: "Both of you agree", body: "A parent (19 or over) invites their teen's account. Nothing happens until the teen accepts." },
  { icon: ShieldCheck, title: "Limits on top of the teen's own", body: "The parent sets daily limits and locked times. The stricter of the two always wins, and only the parent can loosen theirs." },
  { icon: Lock, title: "Never their messages", body: "Parents see the limits and today's minutes per section, never messages, private posts or who the teen talks to." },
  { icon: Info, title: "It ends at 18", body: "Controls lapse on 1 January of the year the teen turns 18, or sooner if the parent removes them." },
];

/** Parental controls: their own page, apart from the person's own Brick mode. */
export default function ParentalControls() {
  usePageTitle("Parental controls", 1);
  const { profile } = useShell();
  const { policy } = useBrick();
  return (
    <>
      <TopBar title="Parental controls" back backTo="/account/settings" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] space-y-6 px-4 pb-16 pt-5 md:px-6">
          <header className="hidden md:block"><h1 className="text-title-1">Parental controls</h1></header>
          <ul className="grid gap-3 sm:grid-cols-2">
            {HOW.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                <Icon size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
                <span>
                  <span className="block text-callout font-semibold">{title}</span>
                  <span className="mt-0.5 block text-caption text-fg-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <FamilySection profile={profile} policy={policy} />
        </div>
      </div>
    </>
  );
}
