// Running a circle: join requests, the approval queue, limits, rules, interests and deleting it.
import { Check, Hourglass, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AGE_LIMITS, approveJoinRequest, approvePost, AUTOMOD_DEFAULTS, declineJoinRequest, deleteGroup,
  deletePost, fetchJoinRequests, fetchPendingPosts, setCircleInterests, setCircleLimits,
  setCircleRules, setScreeningQuestions,
} from "../../lib/db";
import { shortTime } from "../../lib/format";
import { navigate } from "../../lib/router";
import { InterestToggles } from "../Interests";
import Button from "../ui/Button";
import Dialog, { ConfirmDialog } from "../ui/Dialog";
import { Checkbox, Field, Input, Textarea } from "../ui/Field";
import { EmptyState, Skeleton } from "../ui/States";
import Tabs from "../ui/Tabs";
import { useToast } from "../ui/toast-context";

export function ManageDialog({ group, isOwner, section, onSection, onClose, onSaved, onCountChange }) {
  return (
    <Dialog title="Manage circle" onClose={onClose} size="lg">
      <Tabs variant="underline" label="Manage" value={section} onChange={onSection} className="-mx-1 mb-5"
        tabs={[
          { id: "requests", label: "Requests" },
          { id: "posts", label: "Posts" },
          { id: "limits", label: "Limits" },
          { id: "rules", label: "Details" },
        ]} />
      {section === "requests" && <JoinRequests group={group} onCountChange={onCountChange} />}
      {section === "posts" && <PostQueue group={group} />}
      {section === "limits" && <LimitsEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
      {section === "rules" && <RulesEditor group={group} onSaved={onSaved} isOwner={isOwner} />}
    </Dialog>
  );
}

function JoinRequests({ group, onCountChange }) {
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchJoinRequests(group.id).then(setRequests).catch(() => setRequests([]));
  }, [group.id]);

  const decide = async (r, approve) => {
    setBusy(r.id);
    try {
      if (approve) { await approveJoinRequest(group.id, r); onCountChange((c) => c + 1); }
      else await declineJoinRequest(group.id, r.uid);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: approve ? `@${r.username || "Member"} approved` : "Request declined" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  if (requests === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!requests.length) return <EmptyState compact icon={Users} title="No one's waiting to join" />;

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li key={r.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-callout font-semibold">@{r.username || "someone"}</p>
          <dl className="mt-2 space-y-2">
            {(r.answers || []).map((a, i) => (
              <div key={i}>
                <dt className="text-caption text-fg-subtle">{a.q}</dt>
                <dd className="text-callout">{a.a}</dd>
              </div>
            ))}
          </dl>
          {group.rules && <p className="mt-2 flex items-center gap-1.5 text-caption text-success-text"><Check size={13} aria-hidden="true" /> Agreed to the rules</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
            <Button size="sm" icon={X} disabled={busy === r.id} onClick={() => decide(r, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Posts held for approval. Approving publishes it to the circle; declining
   deletes it. */
function PostQueue({ group }) {
  const toast = useToast();
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetchPendingPosts(group.id).then(setPosts).catch(() => setPosts([]));
  }, [group.id]);

  const decide = async (p, approve) => {
    setBusy(p.id);
    try {
      if (approve) await approvePost(p, group); else await deletePost(p);
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      toast({ title: approve ? "Approved and published" : "Declined and removed" });
    } catch {
      toast({ tone: "error", title: "Couldn't save that decision" });
    } finally { setBusy(""); }
  };

  const approval = { ...AUTOMOD_DEFAULTS, ...(group.automod || {}) }.requirePostApproval;

  if (posts === null) return <Skeleton className="h-24 !rounded-card" />;
  if (!posts.length) {
    return (
      <EmptyState compact icon={Hourglass} title="Nothing waiting"
        body={approval ? "New posts from members land here before anyone else sees them." : "Turn on post approval in Limits to review members' posts first."} />
    );
  }
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id} className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-caption text-fg-subtle">@{p.authorName} · {shortTime(p.createdAt)}</p>
          {p.title && <p className="mt-1 text-callout font-semibold">{p.title}</p>}
          <p className="mt-1 whitespace-pre-wrap break-words text-callout">{p.text || "(photo or video, no caption)"}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === p.id} onClick={() => decide(p, true)}>Approve</Button>
            <Button size="sm" variant="danger-ghost" icon={X} disabled={busy === p.id} onClick={() => decide(p, false)}>Decline</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Every switch here is enforced by the server, not just the app. */
function LimitsEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [a, setA] = useState({ ...AUTOMOD_DEFAULTS, ...(group.automod || {}) });
  const [words, setWords] = useState((group.automod?.bannedWords || []).join(", "));
  const [requireApproval, setRequireApproval] = useState(!!group.requireApproval || group.privacy !== "public");
  const [ageLimit, setAgeLimit] = useState(group.ageLimit || 0);
  const [busy, setBusy] = useState(false);
  const locked = !isOwner;
  const set = (k) => (v) => setA((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await setCircleLimits(group.id, {
        requireApproval: group.privacy !== "public" ? true : requireApproval,
        ageLimit,
        automod: { ...a, bannedWords: words.split(",").map((w) => w.trim()).filter(Boolean) },
      });
      onSaved();
      toast({ title: "Limits saved", body: "They apply to everything posted from now on." });
    } catch {
      toast({ tone: "error", title: "Couldn't save the limits" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {locked && <p className="rounded-control bg-surface-2 p-3 text-callout text-fg-muted">Only the circle's admin can change limits.</p>}

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can join</h3>
        {group.privacy !== "public" ? (
          <p className="text-caption text-fg-muted">Private and hidden circles always need an admin to approve new members.</p>
        ) : (
          <Choice locked={locked} name="Who can join" value={requireApproval ? "ask" : "open"} onChange={(v) => setRequireApproval(v === "ask")}
            options={[
              { id: "open", label: "Anyone can join", blurb: "Unless you've set screening questions, which always need approval." },
              { id: "ask", label: "Admins approve new members", blurb: "Requests land in the Requests tab." },
            ]} />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Age limit</h3>
        <Choice locked={locked} name="Age limit" value={ageLimit} onChange={setAgeLimit} options={AGE_LIMITS} />
        <p className="text-caption text-fg-subtle">Applies to new members. Accounts without a birth year can't join age-limited circles.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-callout font-semibold">Who can post</h3>
        <Choice locked={locked} name="Who can post" value={a.postingPermission} onChange={set("postingPermission")}
          options={[
            { id: "members", label: "All members", blurb: "Anyone in the circle can post and plan gatherings." },
            { id: "admins", label: "Only admins and moderators", blurb: "Members can still comment, react and reply to gatherings." },
          ]} />
      </section>

      <section>
        <h3 className="mb-1 text-callout font-semibold">What gets through</h3>
        <div className={`rounded-card border border-line bg-surface-2 px-3 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <Checkbox checked={!!a.requirePostApproval} onChange={set("requirePostApproval")}
            description="Members' posts wait in Manage → Posts until an admin or moderator approves them.">
            Approve posts before they appear
          </Checkbox>
          <Checkbox checked={!!a.blockLinks} onChange={set("blockLinks")} description="Stops link spam. Admins and moderators can still post links.">
            Block posts with links
          </Checkbox>
          <Checkbox checked={!!a.blockNewAccounts} onChange={set("blockNewAccounts")} description="Accounts under 7 days old can read but not post.">
            Hold back brand-new accounts
          </Checkbox>
        </div>
      </section>

      <Field label="Blocked words" hint="Comma separated, up to 40. Posts containing any of them are turned down, for everyone." count={words.length} max={600}>
        <Input value={words} onChange={(e) => setWords(e.target.value)} placeholder="crypto, referral, giveaway" maxLength={600} disabled={locked} />
      </Field>

      {!locked && <Button variant="primary" full loading={busy} onClick={save}>Save limits</Button>}
    </div>
  );
}

function Choice({ name, value, onChange, options, locked }) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2">
      {options.map((o) => (
        <label key={o.id} className={`press flex min-h-12 cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
          value === o.id ? "border-accent-text bg-accent-soft" : "border-line hover:border-line-strong"
        } ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <input type="radio" name={name} checked={value === o.id} disabled={locked} onChange={() => onChange(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
          <span>
            <span className="block text-callout font-semibold">{o.label}</span>
            {o.blurb && <span className="block text-caption text-fg-muted">{o.blurb}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RulesEditor({ group, onSaved, isOwner }) {
  const toast = useToast();
  const [rules, setRules] = useState(group.rules || "");
  const [questions, setQuestions] = useState(group.screeningQuestions || []);
  const [topics, setTopics] = useState(group.interests || []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isOwner) return <p className="text-callout text-fg-muted">Only the circle's admin can edit rules and questions.</p>;

  const save = async () => {
    setBusy(true);
    try {
      await setCircleRules(group.id, rules.trim());
      await setScreeningQuestions(group.id, questions.filter((q) => q && q.trim()));
      await setCircleInterests(group.id, topics);
      onSaved();
      toast({ title: "Rules saved" });
    } catch { toast({ tone: "error", title: "Couldn't save the rules" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-callout font-medium">Interests <span className="font-normal text-fg-subtle">Up to 3. People find the circle by these.</span></legend>
        <InterestToggles value={topics} onChange={setTopics} max={3} label="Circle interests" />
      </fieldset>
      <Field label="Rules" hint="One per line. People agree to them when they ask to join." count={rules.length} max={2000}>
        <Textarea autoGrow rows={4} value={rules} maxLength={2000} onChange={(e) => setRules(e.target.value)}
          placeholder={"Be kind\nNo self-promotion\nStay on topic"} />
      </Field>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-callout font-medium">Screening questions <span className="font-normal text-fg-subtle">Up to 3, optional</span></legend>
        {[0, 1, 2].map((i) => (
          <Input key={i} value={questions[i] || ""} maxLength={200} placeholder={`Question ${i + 1}`}
            aria-label={`Screening question ${i + 1}`}
            onChange={(e) => { const next = [...questions]; next[i] = e.target.value; setQuestions(next); }} />
        ))}
        <p className="text-caption text-fg-subtle">Asking anything means every new member needs approval.</p>
      </fieldset>
      <Button variant="primary" full loading={busy} onClick={save}>Save rules and interests</Button>

      <section aria-labelledby="danger-h" className="rounded-card border border-danger/40 p-4">
        <h3 id="danger-h" className="text-callout font-semibold text-danger-text">Delete this circle</h3>
        <p className="mt-1 text-caption text-fg-muted">Removes the circle, every post in it and every membership. This can't be undone.</p>
        <Button variant="danger" size="sm" icon={Trash2} className="mt-3" onClick={() => setConfirmDelete(true)}>Delete circle</Button>
      </section>
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${group.name}?`} confirmLabel="Delete circle" busy={deleting}
          body="Every post, member and join request goes with it, for everyone. This can't be undone."
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteGroup(group);
              toast({ title: "Circle deleted" });
              navigate("/circles", { replace: true });
            } catch {
              toast({ tone: "error", title: "Couldn't delete the circle" });
              setDeleting(false);
            }
          }} />
      )}
    </div>
  );
}
