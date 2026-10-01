import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { fetchMyStories, isNewsWriter, me } from "../../lib/db";
import { useJournalist, useJournalistStories } from "../../lib/journalists";
import { JournalistCard, JournalistSettings } from "./Journalist";
import Desk from "./Desk";
import { navigate } from "../../lib/router";
import { usePageTitle } from "../../lib/usePageTitle";
import TopBar from "../shell/TopBar";
import Button from "../ui/Button";
import { EmptyState, Skeleton } from "../ui/States";

export default function Newsroom() {
  usePageTitle("Newsroom", 1);
  const [writer, setWriter] = useState(undefined);
  const [stories, setStories] = useState(null);
  const loadedJournalist = useJournalist(me());
  const [editedJournalist, setEditedJournalist] = useState(null);
  const journalist = editedJournalist || loadedJournalist;
  const published = useJournalistStories(me(), !!journalist);
  const [editingByline, setEditingByline] = useState(false);

  const load = () => fetchMyStories().then(setStories).catch(() => setStories([]));
  useEffect(() => {
    isNewsWriter().then((w) => { setWriter(w); if (w) load(); }).catch(() => setWriter(false));
  }, []);

  return (
    <>
      <TopBar title="Newsroom" back backTo="/news" />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-5 md:px-6">
          <header className="mb-5 hidden md:block">
            <h1 className="text-title-1">Newsroom</h1>
            <p className="text-callout text-fg-muted">Write, co-write and publish your stories, and keep them in folders.</p>
          </header>

          {writer === undefined && <Skeleton className="h-32 !rounded-card" />}
          {writer === false && (
            <EmptyState icon={Newspaper} title="Mesh News is written by verified journalists"
              body="Publishing on Mesh News is limited to journalists whose identity Mesh has verified. Anyone can read stories and request corrections."
              action={<Button onClick={() => navigate("/news")}>Read the news</Button>} />
          )}
          {writer && (
            <>
              {journalist && (
                <div className="-mx-4 md:-mx-6">
                  {!journalist.region && (
                    <p className="mx-4 mb-2 text-callout text-fg-muted md:mx-6">
                      Set up your byline: readers see your outlet, region and any political affiliation on every story.
                    </p>
                  )}
                  <JournalistCard uid={me()} journalist={journalist} stories={published} onEdit={() => setEditingByline(true)} />
                </div>
              )}
              {stories === null ? <Skeleton className="h-40 !rounded-card" /> : <Desk stories={stories} setStories={setStories} />}
            </>
          )}
        </div>
      </div>
      {editingByline && journalist && (
        <JournalistSettings journalist={journalist} onClose={() => setEditingByline(false)}
          onSaved={(j) => { setEditedJournalist(j); setEditingByline(false); }} />
      )}
    </>
  );
}
