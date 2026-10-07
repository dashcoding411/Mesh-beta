import { BUSINESS } from "./business.js";
import { DOCUMENT_TITLES } from "./titles.js";

/* These documents describe what the code in this repository actually does.
   If you change what data is collected, who it is shared with, or how long it
   is kept, change these too. A policy that does not match the system is worse
   than no policy, because it becomes a misleading representation.

   They are drafts prepared without legal advice. Have a lawyer admitted in
   your jurisdiction review them before launch. */

const B = BUSINESS;
// Until the operating entity is registered, name who runs Mesh honestly rather
// than printing placeholder text; fill in business.js before launch.
const registered = !B.legalName.startsWith("TODO") && !B.abn.startsWith("TODO");
const OPERATOR = registered
  ? `${B.legalName} (ABN ${B.abn}), trading as ${B.tradingName}`
  : `the founders of ${B.tradingName} (its operating company is being registered; this page will name it once it is)`;

export const PRIVACY = {
  id: "privacy",
  title: DOCUMENT_TITLES.privacy,
  summary:
    "What Mesh collects, why, who can see it, and how to get it back or delete it.",
  sections: [
    {
      h: "Who we are",
      p: [
        `Mesh is operated by ${OPERATOR}, located in ${B.state}, ${B.country}.`,
        `For anything in this policy, contact ${B.privacyEmail}.`,
        "We handle personal information in line with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Where the EU or UK GDPR applies to you, we also honour the rights it gives you.",
      ],
    },
    {
      h: "What we collect",
      list: [
        ["Account details", "Your email address, or your phone number if you sign in by SMS. If you use Google or Apple sign-in, we receive the email address and name they release to us, and nothing else."],
        ["Profile", "Your handle, display name, and anything you choose to add: bio, pronouns, town, birth year, profile picture, relationship link."],
        ["Birth year", "Collected to apply legal age protections. See 'Age' below."],
        ["Content", "Posts (Stills, Strands and Flicks), photos, videos, captions, image descriptions, a place name if you add one to a post, polls, GIFs you choose, comments, reposts, messages, photos and voice messages you send in them, circle membership, gathering RSVPs, news stories you write with their sources, correction suggestions you send, and likes, replies and echoes on stories."],
        ["Interests", "The interests you pick (for example Music or Gardening), the topics you tag on your posts, and the interests a circle's admins give it. Health, religion, politics, sexuality and other sensitive categories are deliberately not on the list."],
        ["Calls", "When you make a voice or video call: who called whom, when, and how long it lasted, kept as a line in that conversation. The call's audio and video are never recorded or stored."],
        ["Interaction signals", "Which accounts you follow, and which posts you like, comment on, repost, save, send, watch, skip, hide, report or vote on. These are used to order your feed and suggest accounts."],
        ["Technical", "Your last-active timestamp, so people you message can see whether you are online."],
        ["Push notifications (only if you turn them on)", "For each device you turn them on for: the address your browser's push service gave it (Google for Chrome and Android, Apple for iPhone and Safari, Mozilla for Firefox), the keys that encrypt notifications for that device, which kinds you want, and when Brick mode makes it quiet. Reminders you set (a roll developing, a gathering starting) are kept until they're sent. This is stored by Cloudflare in its Oceania region, and Cloudflare sends the notifications. Notifications are encrypted end to end, so the push service carries them without being able to read them. Turning notifications off, or deleting your account, deletes all of it."],
        ["Activity record", "The last day you opened Mesh and which of your first 60 days you opened it on, written at most once a day. It holds no content and no times of day. Mesh staff see it only as totals (how many people used Mesh this week, and how many come back), to know whether Mesh is working for people."],
        ["Notifications", "When someone likes, comments on, reposts or mentions your post, likes or echoes your story, follows you, asks to follow you, invites you to a gathering or lets you into a circle, a note of it (their handle and photo, which post or story, and the first 140 characters of a comment, echo or mention) is stored in your notifications. The person who acted writes it, and our servers only accept it if the action really happened."],
        ["Brick mode", "If you use it: your scheduled times, daily limits and any instant brick, a change waiting its 24 hours, your time zone, and the minutes you spend in Feed, Flicks and News each day while a daily limit is on. Minutes are counted in 30-second steps and only for sections with a limit."],
        ["Parental controls", "If a parent links to an under-18 account: who the parent is, whether the teen agreed, the parent's limits and any request the teen sends them."],
        ["Bricked time", "If you use brick mode: how long you've been bricked in total, this week and in your longest single stretch, and your streak of bricked days. Our servers check each claim against your brick mode settings before accepting it."],
        ["Journalists", "If you publish news on Mesh: that an admin made you a writer, your drafts, each version saved when you send a story for review or ask for one, which part of a story you're editing while you're editing it, and live blog updates you post."],
        ["Gathering replies", "A copy of each gathering you reply to (its title, place, start time and your reply), kept with your account so Mesh can show what's coming up without searching every gathering."],
        ["Gathering photos", "Photos you add to a gathering you went to, with your handle and when you added them. They're checked on your device before upload, like every photo on Mesh."],
        ["Rolls", "The rolls you start or join (name, who started it, who's in it and when it develops), the photos you shoot in them with your handle and when you took them, and how many of your 27 shots you've used. Roll photos are taken with the camera only, given their digicam look and date stamp on your device, and checked there before upload."],
        ["Circle activity", "Your last post time in each circle (for slow mode), how far you've got through a circle's guides, and, if a circle admin removes one of your posts, a record of that (a 'strike') with its date."],
        ["Stories and highlights", "Stories you post stay in your story archive after their 24 hours, until you delete them. Highlights are the past stories you choose to keep on your profile, with a name and a cover. What you add in the story editor is kept with the story: on a photo it's part of the picture; on a video, the text and drawing are kept as a see-through image over it, and the words you typed are also kept as text, so screen readers can read them out."],
        ["Saved posts and albums", "The posts you save, and the albums you file them into."],
        ["Notes", "Your note (up to 60 characters, for 24 hours) and who liked it. Replies to a note arrive as messages."],
        ["News reads", "When you open a published story while signed in, a marker that you read it, so each reader counts once in the total its journalists see."],
        ["Brick groups", "The groups you make or join, and a copy of your bricked time and when your current brick ends, kept in each group so its members can compare."],
        ["Appeals", "If you appeal a block: the words that were blocked, the rule they matched, where you were posting, your reason, and the decision."],
        ["Ads", "Totals only: how many times each ad was seen and tapped. Nothing records who saw or tapped it."],
        ["Contacts (only if you sync them)", "Your contacts' phone numbers and emails are turned into scrambled codes (SHA-256) on your device, and only those codes are sent to check for matches; they aren't stored, and their names, numbers and emails never leave your device. We keep only the Mesh accounts found, privately, to suggest them to you. If you choose to let your contacts find you, we store a scrambled code of your own verified phone number or email (never the number or email itself) linked to your account."],
      ],
      p: [
        "We do not collect your device's location, your device identifiers, or your browsing activity on other sites. Contact sync is optional, and even then we never receive your contacts: see 'Contacts' above. A place you type on a post is only the words you chose to share; Mesh never reads where your device is. We do not buy personal information from data brokers.",
      ],
    },
    {
      h: "What we do not do",
      p: [
        "We do not sell your personal information, and we do not share it with advertisers. Mesh shows a few ads from local businesses, clubs and events in Home, always labelled \"Ad\" and never in Messages. An ad is matched only to the town on your profile, the interests you picked and whether you're 18 or over; never to what you do, read or watch on Mesh, and never to anything from other websites. Advertisers see totals (how many times their ad was seen and tapped), never who. There is no third-party ad tracking and there are no advertising cookies, unless you turn on Google ads (below).",
        "Google ads are off unless you turn them on in your cookie choices, and only shown to people 18 and over. Then, when no local ad is booked for a space in Home, Google AdSense fills it. Google and its partners set cookies and see your IP address and browser to show, count and limit ads and to stop fraud. Mesh asks Google for ads that aren't personalised, and sends Google nothing about your account. How Google uses this: policies.google.com/technologies/partner-sites. You can also manage Google's ads at adssettings.google.com. Turn it off any time in Settings, under Cookies and storage.",
        "We do not use your private messages to train machine learning models.",
      ],
    },
    {
      h: "Why we collect it",
      list: [
        ["To run your account", "Authentication, keeping you signed in, and letting people find you by handle."],
        ["To show you content", "Ordering your feed, suggesting accounts and suggesting circles, using the interaction signals and the interests you picked."],
        ["To keep Mesh safe", "Filtering hate speech and spam, limiting the reach of posts that may mock a group, rate-limiting posting, handling reports, suspending accounts that break the Community Guidelines, and enforcing circle rules. The filter runs on the text itself; it doesn't profile you."],
        ["Checking images", "Photos and videos you choose are checked for nudity and sexual content by a model that runs on your own device, before anything uploads. The check doesn't send the image or its result to us or anyone else; only an image that passes is uploaded. Our moderators may run the same check on public posts."],
        ["To meet legal obligations", "Responding to lawful requests and to the eSafety Commissioner where required."],
      ],
    },
    {
      h: "Who can see what",
      list: [
        ["Browsing without an account", "Anyone can read public posts, profiles, circles, gatherings and news without an account. Liking, commenting, following, posting and messaging need one."],
        ["Your profile", "Your handle, display name, photo, bio, pronouns, town, relationship link and follower counts are public, and so, on a public account, are the lists of who you follow and who follows you. Your birth year is never shown: it's stored where only your account can read it."],
        ["Public posts", "Visible to anyone, including people without a Mesh account."],
        ["Private accounts", "If you make your account private, new followers need your approval, and your posts and stories are visible only to the followers you've approved."],
        ["Reposts", "Public. When you repost something, your followers see it with your name on it, and it appears on your profile's Reposts tab."],
        ["Followers-only posts", "Visible to you and the people who follow you. Enforced on our servers, not only in the app."],
        ["Circle posts", "In a public circle, visible to anyone, including people without an account. In a private or hidden circle, visible only to its members. Posts waiting for a circle admin's approval are visible only to you and that circle's admins and moderators."],
        ["Gatherings", "A public gathering's page (title, time, place, description, the host's handle and how many are going) is visible to anyone, including people without a Mesh account, so hosts can invite anyone. Who replied is only visible to people signed in. Private gatherings are visible only to the host, the people they invite, and members of the circle they belong to. If the host hides the guest list, only the host sees who replied. When the guest list is shown, people who follow you may see that you're going on the gathering's card. Photos added after a gathering are visible to signed-in people who can see the gathering; the person who added one, or the host, can remove it."],
        ["Stories", "Visible for 24 hours to the people who can see your posts. After that only you can see them, in your story archive, unless you add them to a highlight, which keeps them on your profile for the people who can see your posts. Only you see who viewed and who liked your story, and when you view someone else's story, they can see that you did. Replies to a story are private messages to you, like any other message. Echoes (public replies on a story) are visible to everyone who can see the story; you can delete any echo on yours, and they're deleted with the story."],
        ["Rolls", "Anyone signed in who has a roll's link can see its name, who started it, how many people are in it and how many shots they've taken, and can join while it's open. Its photos can't be seen by anyone until it develops, at the time set when it was started or earlier if whoever started it (or Mesh staff testing a roll) develops it early; after that, everyone in the roll can see, save and share all of them. The person who took a photo, or who started the roll, can delete it. A link to a roll shows the same general preview for every roll, never its name or who's in it."],
        ["Your notifications", "Visible only to you. The person who caused one can take it back (for example by unliking)."],
        ["Brick mode", "Your limits and minutes are visible only to you, and to a parent you've agreed to link to. That parent sees your limits and today's minutes per section, never your messages, posts you haven't shared with them, or who you talk to."],
        ["Bricked time", "Private unless you choose to share it. If you switch on 'Show on my profile and the leaderboard', anyone can see your bricked totals and streak on your profile and on the leaderboard. Switching it off hides them again."],
        ["Journalist profiles", "If you write News, your outlet (or that you're independent), logo, region and any political affiliation you choose to declare are public, on your profile and with every story you write. Declaring an affiliation is up to you, and you can change or remove it at any time."],
        ["Badges", "Badges Mesh gives an account, like Beta tester, are public on its profile and posts."],
        ["News drafts", "A draft is visible only to its journalists until they publish it. Earlier versions are visible to the journalists and admins, and are deleted with the story. Published stories show every journalist's byline."],
        ["Correction requests", "A request to correct a story is visible to that story's journalists and to Mesh admins, along with your handle."],
        ["Circle guides and strikes", "A circle's admins and moderators can see how far members have got through its guides, and whether a member's post was removed in the last 28 days."],
        ["Messages", "Visible only to the people in that conversation. We can technically access message records to respond to a lawful request or a safety report; we do not read them otherwise."],
        ["Your saved posts, hidden posts, and interaction signals", "Visible only to you."],
        ["Your interests", "Visible only to you. They're stored where no one else's account can read them. A post's topics and a circle's interests are public, like the post or circle itself."],
        ["Poll votes", "Anonymous. Everyone sees the totals; only you can see which option you chose. In a group chat poll, members of that chat can see who voted for what."],
        ["Likes and comments", "People who can see a post can see who liked it and what was said in its comments."],
        ["Voice messages and photos in messages", "Like other messages, visible only to the people in that conversation. Unsending one deletes the recording or photo."],
        ["Reports", "If you report something, moderators see what you reported, why, and anything you add. The person reported isn't told who reported them. Reporting a message shares that one message's text with moderators, not the rest of the conversation."],
        ["Your hidden words", "Visible only to you."],
        ["Being findable by your contacts", "Off unless you turn it on. Then anyone who has your phone number or email in their contacts and syncs them can find your account. Turn it off in Settings → Contacts."],
        ["Accounts found in your contacts", "Visible only to you."],
        ["Notes", "Your note is visible to mutual follows and people you have a one-to-one chat with. Only you see who liked it."],
        ["Saved albums and your story archive", "Visible only to you."],
        ["Brick groups", "A group's members see each other's handle, bricked time this week and in total, streak, and when a current brick ends, even if your bricked time isn't public. Leave the group to stop sharing it."],
        ["Appeals", "Visible to you and to Mesh's admins and moderators, who decide them."],
        ["Suspensions", "If your account is suspended, the end date is stored on your profile so our servers can enforce it. The reason is visible only to you and moderators."],
        ["Who you've blocked", "Visible only to you. The person isn't told. Blocking stops them following you, messaging you, adding you to groups and commenting on your posts."],
      ],
    },
    {
      h: "Who we share it with",
      p: [
        "Mesh runs on Google Firebase (Authentication, Cloud Firestore and Hosting). Google processes this data on our behalf as our service provider.",
        "Your Firestore data, including photos and voice messages, is stored in Google's australia-southeast1 region (Sydney).",
        "joinmesh.social is delivered through Cloudflare's network (a US company), which sees visitors' IP addresses to route traffic and block attacks. Cloudflare Web Analytics counts page views and load times for us without cookies and without building a profile of anyone. When a link to a public story, post, profile, circle or gathering is shared, Cloudflare shows link previewers its title, description and picture, the same things a signed-out visitor could see.",
        "Videos, the still frame shown before one plays, and roll photos are stored with Cloudflare R2. Cloudflare is a US company; the files are kept in its Oceania region and delivered through its worldwide network, so this can be a transfer overseas, and Australian Privacy Principle 8 applies to it. Anyone with a video's link can watch it, as with links to photos.",
        "When you add a location to a post, the words you type in the location box go to Photon, a place search run by komoot (Germany) on OpenStreetMap data, so it can suggest places. Photon also sees your IP address. Nothing else about you is sent, and it only happens while you type there. The place you pick is shown on your post.",
        "GIFs come from GIPHY, a US company. When you open the GIF picker, your search words and your IP address go to GIPHY to fetch results. GIFs only load if you allow them in your cookie choices (or tap a single GIF to load it); then your browser loads them from GIPHY's servers, so GIPHY sees your IP address. We never send GIPHY your name, handle, email or any account detail. Accounts under 18 only see G-rated GIFs. GIPHY's own privacy policy covers what it does with this.",
        "Voice and video calls connect your device directly to the other person's using WebRTC, and the audio and video are encrypted in transit. To find a route between you, your device contacts Google's public STUN servers, which see your IP address, and the other person's device learns your IP address during the call. The setup data is deleted from our database when the call ends. When a direct connection isn't possible (common on mobile data), the call passes through a relay run by Metered (metered.ca), which sees both IP addresses but can't decrypt the call.",
        "Overseas: Google (including AdSense, if you turn on Google ads), Cloudflare, GIPHY and Metered are based in the United States or run servers there and elsewhere, and Photon (komoot) is in Germany. Your account data itself stays in Firestore in Sydney. Each provider gets only what it needs to do its job, under its own privacy terms, and Australian Privacy Principle 8 applies to these disclosures.",
        "Links people share can lead to other websites. Mesh shows you where a link goes and asks before opening it; once you leave, that site's own policies apply, not ours.",
        "If you sign in with Google or Apple, that provider knows you signed in to Mesh.",
        "If you allow the security check in your cookie choices, Mesh runs Google reCAPTCHA Enterprise in the background, through Firebase App Check. Until you do, it doesn't load. It checks that requests come from a real browser on this site and not from a script, and you never see a puzzle. To do that it sends Google information about your browser and device, and Google may set its own cookies. Google says it uses this data to run and improve reCAPTCHA and for general security, not for personalised advertising. If you use phone sign-in, reCAPTCHA also runs when you request an SMS code.",
        "We otherwise disclose personal information only where we are legally required to, or where it is necessary to prevent a serious threat to someone's life, health or safety.",
      ],
    },
    {
      h: "Age",
      p: [
        "Mesh is for people 16 and over, as the Online Safety Amendment (Social Media Minimum Age) Act 2024 requires. Signing up asks for your real birth year (and, if you turn 16 this year, whether you've had your birthday) and for confirmation that it's true, and nobody under 16 can make an account. If someone gives an under-16 birth year, nothing they entered is kept and that device can't start another sign-up for 30 days, using one key stored on the device ('mesh:age-lock'). Accounts made before this were asked for a birth year; an account under 16 can only download its data and delete itself.",
        "Your birth year is stored where only your account can read it, and is used only for age rules: the 16+ minimum, 18+ ads and G-rated GIFs for under-18s. It's never shown on your profile.",
        "Accounts for 16 and 17 year olds start private, with messages only from people they follow. They can change either in Settings.",
        "If you believe an account belongs to someone under 16, report it and we will act, including closing the account.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "We keep your account data for as long as your account exists. Deleting your account removes your profile and handle, posts and their photos and videos (including uploads you never posted), stories, highlights and your story archive, saved posts and albums, news drafts, your note, circles and gatherings you host and your place in other circles, your replies, posts and photos in other people's gatherings, your activity record, rolls you started (with every photo in them) and your photos in other people's rolls, Brick groups, contact-sync matches and findable codes, notifications, brick mode limits and minutes, bricked time, gathering replies list and parental-control links. Notifications you caused in other people's inboxes, and comments you left on other people's posts, stay until they or you delete them, like a sent message. Decided appeals and reports, and the record of how a journalist was checked, are kept as moderation records.",
        "Messages you have sent may remain visible to the people you sent them to, in the same way a sent text message does. Use unsend to remove an individual message for everyone.",
        "Brick mode keeps your daily minutes for 7 days; older days are deleted when you next open Mesh. Notifications are kept until you delete them, and ones older than 90 days are removed when you open the notifications page. Parental controls end on 1 January of the year the teen turns 18, or earlier if the parent removes them.",
        "Backups and server logs may persist for a short period after deletion before being overwritten.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "You can access what we hold about you: Settings → Your data → Download your data gives you a file (JSON) straight away, with your profile, posts, comments, messages you sent, stories, saved posts and albums, news, notes, Brick mode, appeals and more, with no request needed.",
        "You can correct your profile at any time from Profile → Edit profile.",
        "You can delete your account permanently from Settings → Your data → Delete account.",
        `If you want something we have not built a button for, or you want to complain about how we have handled your information, email ${B.privacyEmail}. We aim to respond within 30 days.`,
        "If you are not satisfied with our response, you can complain to the Office of the Australian Information Commissioner at oaic.gov.au. If the GDPR applies to you, you may complain to your local supervisory authority.",
      ],
    },
    {
      h: "Security, and its limits",
      p: [
        "Access to your data is enforced by server-side security rules, not only by the app. Passwords are handled by Firebase Authentication and are never visible to us.",
        "No online service is perfectly secure, and we do not claim Mesh is. If a data breach occurs that is likely to cause you serious harm, we will notify you and the Office of the Australian Information Commissioner as the Notifiable Data Breaches scheme requires.",
      ],
    },
  ],
};

export const TERMS = {
  id: "terms",
  title: DOCUMENT_TITLES.terms,
  summary: "The agreement between you and Mesh. Written to be read.",
  sections: [
    {
      h: "The agreement",
      p: [
        `These terms are between you and ${OPERATOR}. By creating an account you accept them.`,
        `They are governed by the laws of ${B.state}, ${B.country}.`,
      ],
    },
    {
      h: "Who can use Mesh",
      p: [
        "You must be 16 or over to have a Mesh account, as Australian law requires, and old enough to use social media where you live. You must give your real birth year when you sign up. If you're under 16, don't make an account; if we find an account belongs to someone under 16, or was made with a false age, we close it.",
        "One person, one account, and the details you give us should be true. You are responsible for what happens under your account.",
      ],
    },
    {
      h: "Your content stays yours",
      p: [
        "You own what you post. Posting does not transfer ownership to us.",
        "You give us a licence to host, store, reproduce and display your content, limited to what is needed to actually operate Mesh and show your content to the audience you chose. That licence ends when you delete the content, except for copies already shared into conversations and for backups that have not yet cycled out.",
        "We will not sell your content, license it to third parties, or use it in advertising.",
      ],
    },
    {
      h: "What you may not post",
      list: [
        ["Hate speech", "Content attacking people based on race, ethnicity, national origin, caste, religion, sex, gender identity, sexual orientation, disability or serious disease."],
        ["Harassment", "Targeted abuse, threats, stalking, or coordinated pile-ons."],
        ["Nudity and sexual content", "Nudity, pornography, sexual acts and sexually suggestive images or video, whether photographed, drawn or made with AI, anywhere on Mesh, including messages."],
        ["Illegal content", "Anything unlawful where you are or where we operate, including child sexual abuse material, which we report to the relevant authorities."],
        ["Content you have no right to post", "Someone else's photos, video, music or writing, without permission."],
        ["Deceptive synthetic media", "See the section below."],
        ["Spam", "Bulk unsolicited messaging, engagement farming, or scams."],
      ],
    },
    {
      h: "AI: edits yes, generated no",
      p: [
        "Mesh is social media for humans. Pictures and videos made entirely by AI aren't allowed anywhere on Mesh, including stories, comments and messages. Uploads whose files say an AI tool generated them are turned away, reports are acted on, and anyone who keeps posting AI-generated media is suspended.",
        "Editing your own photos and videos with AI is fine: a new background, an object taken out, a different sky. Tick \"Edited with AI\" in the composer and posts carry that label. Mesh adds it for you when the file says it was edited with AI.",
        "You must not present AI-altered material as a real photograph, a real recording, a real event, or a real person's words. You must not use AI to fabricate news, impersonate anyone, or manufacture fake endorsements and reviews.",
        "News submissions must be factual. Fabricated sources, invented quotes and AI-generated 'evidence' are grounds for removal and account termination.",
      ],
    },
    {
      h: "News on Mesh",
      p: [
        "Only journalists whose identity the Mesh team has verified can write for the news section. Nobody else can publish there.",
        "Every story is labelled as a report, analysis, explainer or opinion, so readers know what they're reading. Passing opinion off as reporting isn't allowed. Every story also opens with a 60-second version, three points its journalist writes (never AI), which must be as accurate as the story itself. A published story can be updated for developing news, with a note readers see; mistakes are fixed with corrections.",
        "Each journalist is the publisher of their own stories and is responsible for them, under the journalist agreement they accept before publishing. Mesh hosts stories: it doesn't commission, write, edit or approve them, and lists them newest first rather than ranking them by importance. A story needs a headline, the full text, at least two source links cited in the text, a description for every image, and the journalist's confirmation that it is accurate. A story flagged for a legal read can't be published until that's cleared.",
        "Mesh checks who journalists are before they can publish: their identity, and their work as a journalist (for example published stories, an outlet confirming them, or a press or union card). A record of that check is kept privately by the Mesh team.",
        `If you think a story is defamatory or otherwise unlawful, report it or email ${B.legalEmail}. Mesh will look at it within 7 days, and may restrict or remove the story while it's considered, and tell the journalist so they can respond.`,
        "Readers can request a correction on any story, and corrections are published on the story itself. None of this is a fact-checking certification or a guarantee that a story is true. Form your own view and follow the sources.",
      ],
    },
    {
      h: "Moderation and enforcement",
      p: [
        "We use automated filters and human review. Automated filtering is imperfect in both directions: it misses things it should catch, and occasionally catches things it should not.",
        "We may remove content, restrict features, or suspend or terminate accounts that breach these terms. Where it is reasonable to do so, we will tell you why.",
        "Circle admins can moderate within their own circles. They cannot switch off our platform-wide safety filters.",
        "Every automatic block names the rule it matched and can be appealed to a person, who decides. People, not machines, decide every appeal.",
      ],
    },
    {
      h: "Ads on Mesh",
      p: [
        "Mesh shows a small number of ads in Home to pay for its servers and moderators. Every ad is labelled \"Ad\" and \"Sponsored\", none appear in Messages, and nobody can pay to boost an ordinary post or to change what's in your feed.",
        "Ads from local businesses, clubs and events are matched only to the town on your profile, the interests you picked and whether you're 18 or over. If you turn on Google ads in your cookie choices (18 and over), Google AdSense may fill spaces no local ad is booked for, with ads that aren't personalised.",
        "Ads must be truthful, clearly identifiable as ads and follow the AANA Code of Ethics. Alcohol ads are shown only to people 18 and over; gambling, tobacco, vaping, weapons and adult content aren't accepted. Political and issue ads aren't accepted either: no ads from or about a party, candidate, election or referendum, and none arguing one side of a political issue, and Google ads are set to block them. We may refuse or remove any ad. Advertisers are invoiced directly under a separate agreement, and are responsible for their ads and the pages they link to.",
      ],
    },
    {
      h: "Reporting content",
      p: [
        "Use the report control on any post. Reports go to a review queue and are not visible to the person you reported.",
        `To report a copyright infringement, email ${B.copyrightEmail} with a link to the content, proof of your ownership, and your contact details. We remove infringing content once we've checked the notice, and close the accounts of repeat infringers.`,
        `If you believe something on Mesh is defamatory of you, email ${B.legalEmail} with a link to it, what's wrong with it and how to reach you. We'll acknowledge it, look at it within 7 days, and tell you what we've done, which may include removing it or passing your complaint to the person who posted it. Journalists and other posters are responsible for what they publish.`,
        "Australians can also complain to the eSafety Commissioner about serious cyberbullying, adult cyber abuse, image-based abuse and illegal content, at esafety.gov.au.",
      ],
    },
    {
      h: "What we promise, and what we do not",
      p: [
        "Mesh is provided as it is. We do not promise it will be uninterrupted, error-free, or that it will preserve your content forever. Keep your own copies of anything you cannot lose.",
        "Nothing in these terms excludes the consumer guarantees under the Australian Consumer Law, which cannot be excluded. Where those guarantees apply and we fail to meet them, your rights under that law stand regardless of anything written here.",
        "To the extent the law allows, our liability to you is limited to resupplying the service.",
      ],
    },
    {
      h: "Ending it",
      p: [
        "You can delete your account at any time from Settings → Your data → Delete account. That is permanent.",
        "We may suspend or close an account that breaches these terms, or where we are legally required to.",
      ],
    },
    {
      h: "Changes",
      p: [
        "If we change these terms materially, we will tell you in the app before the change takes effect. Continuing to use Mesh after that means you accept the new terms.",
        `Last updated ${B.lastUpdated}.`,
      ],
    },
  ],
};

export const COOKIES = {
  id: "cookies",
  title: DOCUMENT_TITLES.cookies,
  summary:
    "Mesh uses browser storage to keep you signed in and to stop spam. There is no advertising or analytics tracking unless you turn on Google ads.",
  sections: [
    {
      h: "The short version",
      p: [
        "Mesh sets no advertising cookies and no analytics cookies of its own; Google's advertising cookies only arrive if you turn on Google ads. Visits are counted by Cloudflare Web Analytics, which uses no cookies and doesn't follow you to other websites. Unless you turn on Google ads, there is no third-party tracking on this site. Fonts are served from Mesh itself rather than a font service.",
        "Anything from another company that sets its own cookies, such as Google's reCAPTCHA security check, is off until you allow it. The first time you visit, Mesh asks: you can allow it, keep to essential storage only, or choose item by item. Ignoring or closing the question never counts as a yes.",
        "What we do store is the minimum needed to keep you signed in and to stop the same message being posted a hundred times a second.",
      ],
    },
    {
      h: "Exactly what is stored",
      list: [
        ["Your sign-in session", "Firebase Authentication stores a session token in your browser so you are not asked to sign in on every page load. Clearing it signs you out. Choosing 'Keep me signed in' stores it until you sign out; leaving it unticked stores it only until you close the tab."],
        ["Anti-spam timers", "A timestamp and your last post's text, stored locally under keys beginning 'mesh:', used to enforce the posting cooldown and catch duplicate posts. These never leave your device."],
        ["Recent searches", "Your last few searches, stored under 'mesh:recent-searches' so they're one tap away. Kept on this device only, never sent to us, and cleared by the Clear all button in Search."],
        ["Your cookie choices", "One key, 'mesh:consent', remembering what you allowed and when, so Mesh doesn't ask again on this device."],
        ["Update reload", "One key in session storage, 'mesh:reloaded-for-update', set when Mesh reloads itself into a newer version, so it only does that once. Cleared when you close the tab."],
        ["Interests prompt", "One key per account, beginning 'mesh:asked-interests:', so the 'pick your interests' screen only appears once on this device. Your interests themselves are saved to your account, not here."],
        ["Appearance", "One key, 'mesh:appearance', holding the theme, text size, motion and video settings you chose in Settings, so this device keeps them. Kept on this device only."],
        ["Profile photo reminder", "One key per account, beginning 'mesh:photo-nudge:', remembering that you dismissed the reminder to add a profile photo. Kept on this device only."],
        ["Second looks", "One key, 'mesh:second-look', listing photo posts with several photos that you scrolled past without looking through, so next time they open on their second photo. It holds post ids and times only, for a week at most, and never leaves your device."],
        ["Drafts", "Keys beginning 'mesh:draft:' hold the words of a post or message you started but didn't send, so closing the composer or switching chats doesn't lose them. Photos and videos aren't kept. Kept on this device only, for a week at most, and deleted when you send, discard or sign out."],
        ["Time on Mesh", "Keys beginning 'mesh:time:' hold how many minutes you had Mesh open on each of the last 21 days, for 'Your week on Mesh'. 'mesh:news-read' lists the News stories you opened in the last 14 days, for Today's brief. Both stay on this device and are never sent to us."],
        ["Notifications on this device", "A small background script (a service worker, '/sw.js') shows notifications and opens Mesh when you tap one; it doesn't cache pages or read what you do. 'mesh:push-kinds' remembers which kinds you want, and 'mesh:push-asked' when Mesh last offered to turn them on, so it doesn't keep asking. Both stay on this device."],
        ["Activity check", "Keys beginning 'mesh:active:' remember the day this device last updated your activity record, so it's written at most once a day."],
        ["Follow suggestions", "Keys beginning 'mesh:suggest:' keep the accounts suggested to you, and why, for 6 hours, so Mesh doesn't work them out again on every visit. They stay on this device."],
        ["Opening quickly", "Keys beginning 'mesh:snap:' keep a copy of what Mesh shows first: your own profile, settings, and who you follow, block and mute, plus the top of your Home feed (up to a day old). Mesh opens with them straight away and then brings them up to date. They stay on this device, are never sent anywhere, and are deleted whenever nobody is signed in. 'mesh:last-account' remembers which account last signed in here, so if you're signed out without choosing to, Mesh can say so."],
        ["Remembered views", "Small preferences kept on this device only: the newsroom's list or grid view ('mesh:desk-view'), the camera you used last ('mesh:camera-facing'), whether video autoplays ('mesh:autoplay'), and that you've seen the Brick mode intro ('mesh:brick-intro'), the first-run tour ('mesh:tour-done:') or a circle's welcome note ('mesh:circle-welcome:'), that you've seen the welcome page ('mesh:welcomed') or this week's recap card ('mesh:week-seen:'), the area you typed in What's on ('mesh:whatson-area'), whether the roll camera's flash and shutter sound are on ('mesh:roll-flash', 'mesh:roll-sound'), and which developed rolls you've already opened ('mesh:roll-seen:')."],
        ["Signing in with Google from the home screen", "When Mesh is added to an iPhone's home screen, 'mesh:google-signin' (session storage, this tab only) holds two random codes for a moment while you sign in with Google, so Mesh only accepts Google's answer to its own request. It's removed as soon as you're back."],
        ["Keep me signed in", "If you sign in without 'keep me signed in', 'mesh:ephemeral-session' (on this device) and 'mesh:tab' (for this tab only, in session storage) let Mesh sign you out when you close the last Mesh tab."],
        ["Moderation checks", "For Mesh admins and moderators only: 'mesh:image-sweep' remembers which public images this device has already checked, so each is checked once."],
        ["Cloudflare security cookies", "joinmesh.social is delivered through Cloudflare. If Cloudflare needs to check that a visit comes from a person (for example during an attack), it may set short-lived security cookies such as __cf_bm or cf_clearance. They're strictly necessary, aren't used for ads, and don't follow you to other sites."],
        ["Google ads (only if you allow it, 18 and over)", "Google AdSense fills ad spaces in Home that no local ad is booked for. Google and its partners set advertising cookies to show, count and limit ads and to stop fraud. Mesh requests ads that aren't personalised. See policies.google.com/technologies/partner-sites."],
        ["Google reCAPTCHA (only if you allow it)", "Loaded by Firebase App Check to tell real visitors from scripts, if you allow the security check. It also runs if you choose phone sign-in, because that's how the text message code is protected. Google sets its own cookies for this. It's a security measure: it isn't used for advertising, and Mesh receives only a pass or fail."],
      ],
    },
    {
      h: "Your choices",
      p: [
        "Essential storage (signing in, anti-spam and the settings you pick) is always on, because Mesh can't work without it.",
        "Everything else is optional and off until you say yes. Allowing it and keeping to essential only are offered side by side, and both are just as easy.",
        "Change your mind any time: Settings → Privacy and safety → Cookies and storage, or the button at the top of this page. Turning something off takes full effect the next time you open Mesh.",
        "If we ever add analytics or any other non-essential storage, it will be off until you say yes.",
      ],
    },
    {
      h: "Controlling it",
      p: [
        "Your browser settings can block or clear all of this. Blocking storage for this site will sign you out and keep you signed out.",
        "Signing out from Settings → Account → Sign out clears your session on this device.",
      ],
    },
  ],
};

export const REFUNDS = {
  id: "refunds",
  title: DOCUMENT_TITLES.refunds,
  summary: "Mesh is free to use. Here's what happens if that ever changes, and how advertisers are handled.",
  sections: [
    {
      h: "Right now",
      p: [
        "Mesh doesn't charge people to use it. There are no subscriptions, no purchases, no tipping, and we do not store payment details. If a page ever asks you to pay for Mesh, it is not us. Do not enter card details, and tell us.",
        "Businesses that advertise on Mesh are invoiced directly, never through the app. Their pricing, what happens if an ad doesn't run as agreed, and refunds are set out in their advertising agreement, alongside their rights under the Australian Consumer Law.",
      ],
    },
    {
      h: "If we introduce paid features",
      p: [
        "We will publish pricing before you are asked to pay, and you will always confirm a charge before it is taken.",
        "Subscriptions will be cancellable at any time, and cancelling will stop the next renewal rather than the current period.",
      ],
    },
    {
      h: "Your rights under Australian Consumer Law",
      p: [
        "Consumer guarantees apply to paid digital products and services and cannot be contracted out of.",
        "If a paid feature has a major problem (it is unusable, substantially different from what was described, or unfit for its stated purpose), you are entitled to a refund, and you choose the remedy rather than us.",
        "For a minor problem we may repair or replace it within a reasonable time. If we cannot, you can still get a refund.",
        "Changing your mind is not by itself a right to a refund, though we may give one anyway.",
      ],
    },
    {
      h: "Asking for one",
      p: [
        `Email ${B.supportEmail} with your account handle and what went wrong. We aim to respond within 5 business days and to process approved refunds to the original payment method within 10 business days.`,
        "If we cannot resolve it, you can contact the ACCC or your state consumer affairs body.",
      ],
    },
  ],
};

export const GUIDELINES = {
  id: "guidelines",
  title: DOCUMENT_TITLES.guidelines,
  summary: "What Mesh is for, and what gets you removed.",
  sections: [
    {
      h: "What Mesh is for",
      p: [
        "Mesh exists to make ordinary people's stories reachable without an advertising machine deciding which ones deserve an audience. A few labelled ads pay for the servers and moderators, but they never decide what you see: we don't rank content by what pays best, and nobody can pay to boost a post.",
      ],
    },
    {
      h: "Mesh can't be bought",
      p: [
        "Money doesn't buy reach here. Nobody can pay to boost a post or a news story, Mesh doesn't run political or issue ads, and advertisers never decide what's in your feed or in News.",
        "Money doesn't buy a crowd either. Likes, saves, reposts and comments from accounts under a week old count for very little in what Mesh shows other people, a comment written by an account that new is marked \"New account\", and staff look into sudden bursts of them. The numbers you see are still the real numbers.",
        "News on Mesh is written by named journalists who declare who they work for, any political affiliation and any conflict of interest. Stories aren't ranked by likes or clicks, so nobody can push one up by buying engagement.",
        "Mesh isn't a company yet. When it becomes one, we plan to write these promises into its rules, so a new owner or investor can't quietly drop them.",
      ],
    },
    {
      h: "One rule for everyone",
      p: [
        "Everyone on Mesh gets the same protection, and the same limits. It doesn't matter which group is targeted (majority or minority), which country, faith or community someone comes from, or which side of politics is speaking. Mesh doesn't take sides in arguments. It takes the side of people not being attacked for who they are.",
        "You're free to criticise ideas, religions as belief systems, countries, governments, companies, policies and public figures, and to argue about immigration, politics and culture. You're not free to attack people for their race, ethnicity, nationality or migration status, caste, religion, sexuality, gender, gender identity, age or disability.",
      ],
      list: [
        ["Allowed", "\"India's government got this wrong.\" \"I think this religion's teaching is harmful.\" \"Immigration levels are too high.\" Jokes about your own family's culture. Quoting a policy to argue against it."],
        ["Not allowed", "Slurs, for any group. Calling a group of people animals, vermin, dirty, a disease or criminals. Saying a group should die, be expelled or doesn't belong. \"Go back to your country.\" Stereotype abuse, like the running jokes aimed at Indians, Chinese, Aboriginal, Black, Jewish, Muslim or white people. Telling someone to kill themselves."],
        ["Context counts", "Mesh reads how words are used, not just which words. Calling hate out (\"saying X are dirty is racist\"), denying it (\"not all X are...\"), joking about your own group, and describing abuse that happened to you (\"he called me a ...\") are all allowed. Quoted slurs post behind a warning that readers tap through. Laughing along or agreeing (\"lol my mate said X are dirty\", \"not racist but...\") doesn't count as context."],
      ],
    },
    {
      h: "The rules",
      list: [
        ["Do not attack people for who they are", "As above: every group, every side, the same way."],
        ["Do not harass", "No targeted abuse, threats, or pile-ons. Many people making the same joke at one person or one group is a pile-on, even if each post seems small."],
        ["Do not deceive", "No impersonation, no fabricated news, no fake reviews or endorsements. No AI-generated pictures or videos at all. Editing your own photos with AI is fine; tick \"Edited with AI\"."],
        ["Keep it non-sexual", "No nudity, pornography or sexually suggestive images or video, real, drawn or made with AI, anywhere on Mesh, including messages."],
        ["Do not post what is not yours", "Only post media you made or have permission to use."],
        ["Do not spam", "No engagement farming, bulk unsolicited messages, or scams."],
        ["Respect the age rules", "Mesh is 16 and over. Do not help someone under 16 create an account, and report accounts that belong to under-16s."],
      ],
    },
    {
      h: "How enforcement works",
      list: [
        ["Blocked before posting", "Slurs, dehumanising statements about groups, calls for violence or exclusion, and telling someone to hurt themselves are stopped before they post when Mesh's filter catches them (no filter catches everything, so please report what gets through), with a message saying why, unless the context shows you're reporting or calling them out. The clearest slurs are also refused by our servers unless the post is labelled as quoting them, so they can't reach anyone unwarned by going around the app."],
        ["What's checked", "Everything other people see in public: posts, comments, names, bios, circles, gatherings and news. The words in private messages aren't filtered: what you say to each other is yours. If someone abuses you in a message, block them and report it."],
        ["Images", "Every photo and video, including ones sent in messages, is checked for nudity and sexual content on your own device before it uploads, and refused if it doesn't pass. The check never sends your photos anywhere. Moderators also recheck recent public posts; clearly explicit ones are taken down straight away and the rest are reviewed by a person."],
        ["Allowed, but not amplified", "Posts that could read as mocking a group, and blanket insults like \"X are stupid\", can be posted, but Mesh won't recommend them to people who don't follow you, never shows two close together, and folds such comments away behind a tap. Your words stay yours; our reach is ours to give."],
        ["Reports and review", "Anyone can report a post, comment, message or account. A person reviews every report against these guidelines. A post reported by several established accounts leaves feeds until it's reviewed; if it follows the guidelines it goes straight back, and reports can't hold it again. Brand-new accounts can report, but their reports don't count towards that, so a wave of fresh accounts can't bury someone."],
        ["Consequences", "Removal of the content, then suspension (a day, a week, a month, or permanently), which stops posting, commenting and messaging while still letting you read. Serious harms, such as child safety issues and credible threats, go straight to a permanent ban and are reported to authorities."],
        ["Appeals", "Every block names the rule it matched, with an \"Appeal to a person\" button right there. A member of the Mesh team reads it and decides; if they agree, you can post it as you wrote it. A suspended account is told why and until when; if you think that's wrong, email us and a different person will look at it. People, not machines, decide every appeal."],
        ["Your own controls", "Block anyone. Hide words and phrases from everything you see. Limit who can comment on your posts or message you. Mark posts \"Not interested\"."],
        ["Circles", "Circle admins moderate their own circles and can add stricter rules, but can't loosen these."],
        ["No filter is perfect", "It will miss things, and occasionally stop something harmless. Report what gets through, and tell us when it gets something wrong. The filter covers English only for now."],
      ],
    },
  ],
};

export const DOCUMENTS = [PRIVACY, TERMS, GUIDELINES, COOKIES, REFUNDS];
