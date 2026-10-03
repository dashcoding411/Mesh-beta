import { BUSINESS } from "./business.js";
import { DOCUMENT_TITLES } from "./titles.js";

/* These documents describe what the code in this repository actually does.
   If you change what data is collected, who it is shared with, or how long it
   is kept, change these too. A policy that does not match the system is worse
   than no policy, because it becomes a misleading representation.

   They are drafts prepared without legal advice. Have a lawyer admitted in
   your jurisdiction review them before launch. */

const B = BUSINESS;
const OPERATOR = `${B.legalName} (ABN ${B.abn}), trading as ${B.tradingName}`;

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
        ["Notifications", "When someone likes, comments on, reposts or mentions your post, likes or echoes your story, follows you, asks to follow you, invites you to a gathering or lets you into a circle, a note of it (their handle and photo, which post or story, and the first 140 characters of a comment, echo or mention) is stored in your notifications. The person who acted writes it, and our servers only accept it if the action really happened."],
        ["Brick mode", "If you use it: your scheduled times, daily limits and any instant brick, a change waiting its 24 hours, your time zone, and the minutes you spend in Feed, Flicks and News each day while a daily limit is on. Minutes are counted in 30-second steps and only for sections with a limit."],
        ["Parental controls", "If a parent links to an under-18 account: who the parent is, whether the teen agreed, the parent's limits and any request the teen sends them."],
        ["Bricked time", "If you use brick mode: how long you've been bricked in total, this week and in your longest single stretch, and your streak of bricked days. Our servers check each claim against your brick mode settings before accepting it."],
        ["Mesh News writers", "If you write for Mesh News: that an admin made you a writer, your drafts, each version saved when you send a story for review or ask for one, which part of a story you're editing while you're editing it, and live blog updates you post."],
        ["Gathering replies", "A copy of each gathering you reply to (its title, place, start time and your reply), kept with your account so Mesh can show what's coming up without searching every gathering."],
        ["Circle activity", "Your last post time in each circle (for slow mode), how far you've got through a circle's guides, and, if a circle admin removes one of your posts, a record of that (a 'strike') with its date."],
      ],
      p: [
        "We do not collect your contacts, your device's location, your device identifiers, or your browsing activity on other sites. A place you type on a post is only the words you chose to share; Mesh never reads where your device is. We do not buy personal information from data brokers.",
      ],
    },
    {
      h: "What we do not do",
      p: [
        "We do not sell your personal information. We do not share it with advertisers. We do not run advertising or third-party tracking on Mesh, and there are no analytics or advertising cookies on this site.",
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
        ["Your profile", "Your handle, display name, photo, bio, pronouns, town, relationship link and follower counts are public. Your birth year is never shown: it's stored where only your account can read it."],
        ["Public posts", "Visible to anyone, including people without a Mesh account."],
        ["Private accounts", "If you make your account private, new followers need your approval, and your posts and stories are visible only to the followers you've approved."],
        ["Reposts", "Public. When you repost something, your followers see it with your name on it, and it appears on your profile's Reposts tab."],
        ["Followers-only posts", "Visible to you and the people who follow you. Enforced on our servers, not only in the app."],
        ["Circle posts", "In a public circle, visible to anyone, including people without an account. In a private or hidden circle, visible only to its members. Posts waiting for a circle admin's approval are visible only to you and that circle's admins and moderators."],
        ["Gatherings", "A public gathering's page (title, time, place, description, the host's handle and how many are going) is visible to anyone, including people without a Mesh account, so hosts can invite anyone. Who replied is only visible to people signed in. Private gatherings are visible only to the host, the people they invite, and members of the circle they belong to. If the host hides the guest list, only the host sees who replied."],
        ["Stories", "Visible for 24 hours to the people who can see your posts. Only you see who viewed and who liked your story, and when you view someone else's story, they can see that you did. Replies to a story are private messages to you, like any other message. Echoes (public replies on a story) are visible to everyone who can see the story; you can delete any echo on yours, and they're deleted with the story."],
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
        ["Suspensions", "If your account is suspended, the end date is stored on your profile so our servers can enforce it. The reason is visible only to you and moderators."],
        ["Who you've blocked", "Visible only to you. The person isn't told. Blocking stops them following you, messaging you, adding you to groups and commenting on your posts."],
      ],
    },
    {
      h: "Who we share it with",
      p: [
        "Mesh runs on Google Firebase (Authentication, Cloud Firestore, Cloud Storage). Google processes this data on our behalf as our service provider.",
        "Your Firestore data, including photos and voice messages, is stored in Google's australia-southeast1 region (Sydney).",
        "Videos, and the still frame shown before one plays, are stored with Cloudflare R2. Cloudflare is a US company; the files are kept in its Oceania region and delivered through its worldwide network, so this can be a transfer overseas, and Australian Privacy Principle 8 applies to it. Anyone with a video's link can watch it, as with links to photos.",
        "When you add a location to a post, the words you type in the location box go to Photon, a place search run by komoot (Germany) on OpenStreetMap data, so it can suggest places. Photon also sees your IP address. Nothing else about you is sent, and it only happens while you type there. The place you pick is shown on your post.",
        "GIFs come from GIPHY, a US company. When you open the GIF picker, your search words and your IP address go to GIPHY to fetch results. GIFs only load if you allow them in your cookie choices (or tap a single GIF to load it); then your browser loads them from GIPHY's servers, so GIPHY sees your IP address. We never send GIPHY your name, handle, email or any account detail. Accounts under 16 only see G-rated GIFs. GIPHY's own privacy policy covers what it does with this.",
        "Voice and video calls connect your device directly to the other person's using WebRTC, and the audio and video are encrypted in transit. To find a route between you, your device contacts Google's public STUN servers, which see your IP address, and the other person's device learns your IP address during the call. The setup data is deleted from our database when the call ends. If a relay (TURN) server is configured for networks that block direct connections, the encrypted call passes through it without being decrypted.",
        "Links people share can lead to other websites. Mesh shows you where a link goes and asks before opening it; once you leave, that site's own policies apply, not ours.",
        "If you sign in with Google or Apple, that provider knows you signed in to Mesh.",
        "If you allow the security check in your cookie choices, Mesh runs Google reCAPTCHA Enterprise in the background, through Firebase App Check. Until you do, it doesn't load. It checks that requests come from a real browser on this site and not from a script, and you never see a puzzle. To do that it sends Google information about your browser and device, and Google may set its own cookies. Google says it uses this data to run and improve reCAPTCHA and for general security, not for personalised advertising. If you use phone sign-in, reCAPTCHA also runs when you request an SMS code.",
        "We otherwise disclose personal information only where we are legally required to, or where it is necessary to prevent a serious threat to someone's life, health or safety.",
      ],
    },
    {
      h: "Age",
      p: [
        "Mesh is not intended for children under 13, and we do not knowingly create accounts for them.",
        "Australia restricts accounts on age-restricted social media platforms for people under 16. We collect birth year and apply restrictions to accounts under 16. Your birth year is visible only to you. If you believe an account belongs to someone under the minimum age, report it and we will act.",
        "We are actively reviewing our obligations under the Online Safety Amendment (Social Media Minimum Age) Act 2024 and will update this policy as our approach is finalised.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "We keep your account data for as long as your account exists. Deleting your account removes your profile, posts, handle, notifications, brick mode limits and minutes, bricked time, gathering replies list and parental-control links. Notifications you caused in other people's inboxes stay until they delete them, like a sent message.",
        "Messages you have sent may remain visible to the people you sent them to, in the same way a sent text message does. Use unsend to remove an individual message for everyone.",
        "Brick mode keeps your daily minutes for 7 days; older days are deleted when you next open Mesh. Notifications are kept until you delete them, and ones older than 90 days are removed when you open the notifications page. Parental controls end on 1 January of the year the teen turns 18, or earlier if the parent removes them.",
        "Backups and server logs may persist for a short period after deletion before being overwritten.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "You can access everything we hold about you: Account → Your data → Download gives you a JSON export immediately, with no request needed.",
        "You can correct your profile at any time from Profile → Edit profile.",
        "You can delete your account permanently from Settings → Account → Delete account.",
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
        "You need to be old enough to use a social media service where you live. In Australia that currently means 16 or over for age-restricted social media platforms.",
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
      h: "AI-generated content",
      p: [
        "Using AI as a creative tool is welcome. Using it to deceive is not.",
        "You must not present AI-generated or AI-altered material as a real photograph, a real recording, a real event, or a real person's words. You must not use it to fabricate news, impersonate anyone, or manufacture fake endorsements and reviews.",
        "Where AI-generated media could reasonably be mistaken for a real depiction of real people or events, label it. The composer has a \"Made with AI\" option for exactly this, and posts carrying it show the label to everyone.",
        "News submissions must be factual. Fabricated sources, invented quotes and AI-generated 'evidence' are grounds for removal and account termination.",
      ],
    },
    {
      h: "News on Mesh",
      p: [
        "Only journalists whose identity our admins have verified can write for the news section. Nobody else can publish there.",
        "Journalists publish their own stories; Mesh does not edit or approve them first. A story needs a headline, the full text, at least two source links cited in the text, a description for every image, and the journalist's confirmation that it is accurate. A story flagged for a legal read can't be published until that's cleared.",
        "Readers can request a correction on any story, and corrections are published on the story itself. None of this is a fact-checking certification or a guarantee that a story is true. Form your own view and follow the sources.",
      ],
    },
    {
      h: "Moderation and enforcement",
      p: [
        "We use automated filters and human review. Automated filtering is imperfect in both directions: it misses things it should catch, and occasionally catches things it should not.",
        "We may remove content, restrict features, or suspend or terminate accounts that breach these terms. Where it is reasonable to do so, we will tell you why.",
        "Circle admins can moderate within their own circles. They cannot switch off our platform-wide safety filters.",
      ],
    },
    {
      h: "Reporting content",
      p: [
        "Use the report control on any post. Reports go to a review queue and are not visible to the person you reported.",
        `To report a copyright infringement, email ${B.copyrightEmail} with a link to the content, proof of your ownership, and your contact details.`,
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
        "You can delete your account at any time from Settings → Account → Delete account. That is permanent.",
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
    "Mesh uses browser storage to keep you signed in and to stop spam. There is no advertising or analytics tracking.",
  sections: [
    {
      h: "The short version",
      p: [
        "Mesh sets no advertising cookies and no analytics cookies. There is no third-party tracking on this site, and nothing here follows you to other websites. Fonts are served from Mesh itself rather than a font service.",
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
  summary: "Mesh is free. There is nothing to charge or refund yet. Here is what happens if that changes.",
  sections: [
    {
      h: "Right now",
      p: [
        "Mesh does not charge for anything. There are no subscriptions, no purchases, no tipping, and we do not store payment details. If a page ever asks you to pay for Mesh today, it is not us. Do not enter card details, and tell us.",
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
        "Mesh exists to make ordinary people's stories reachable without an advertising machine deciding which ones deserve an audience. We do not sell your attention, and we do not rank content by what pays best.",
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
        ["Do not deceive", "No impersonation, no fabricated news, no AI-generated material passed off as real, no fake reviews or endorsements. Using AI creatively is fine. Tick \"Made with AI\" when someone could mistake it for real."],
        ["Keep it non-sexual", "No nudity, pornography or sexually suggestive images or video, real, drawn or made with AI, anywhere on Mesh, including messages."],
        ["Do not post what is not yours", "Only post media you made or have permission to use."],
        ["Do not spam", "No engagement farming, bulk unsolicited messages, or scams."],
        ["Respect the age rules", "Do not help someone under the minimum age create an account."],
      ],
    },
    {
      h: "How enforcement works",
      list: [
        ["Blocked before posting", "Slurs, dehumanising statements about groups, calls for violence or exclusion, and telling someone to hurt themselves are stopped before they post, with a message saying why, unless the context shows you're reporting or calling them out. The clearest slurs are also refused by our servers unless the post is labelled as quoting them, so they can't reach anyone unwarned by going around the app."],
        ["What's checked", "Everything other people see in public: posts, comments, names, bios, circles, gatherings and news. The words in private messages aren't filtered: what you say to each other is yours. If someone abuses you in a message, block them and report it."],
        ["Images", "Every photo and video, including ones sent in messages, is checked for nudity and sexual content on your own device before it uploads, and refused if it doesn't pass. The check never sends your photos anywhere. Moderators also recheck recent public posts; clearly explicit ones are taken down straight away and the rest are reviewed by a person."],
        ["Allowed, but not amplified", "Posts that could read as mocking a group, and blanket insults like \"X are stupid\", can be posted, but Mesh won't recommend them to people who don't follow you, never shows two close together, and folds such comments away behind a tap. Your words stay yours; our reach is ours to give."],
        ["Reports and review", "Anyone can report a post, comment, message or account. A person reviews every report against these guidelines. A post reported by several established accounts leaves feeds until it's reviewed; if it follows the guidelines it goes straight back, and reports can't hold it again. Brand-new accounts can report, but their reports don't count towards that, so a wave of fresh accounts can't bury someone."],
        ["Consequences", "Removal of the content, then suspension (a day, a week, a month, or permanently), which stops posting, commenting and messaging while still letting you read. Serious harms, such as child safety issues and credible threats, go straight to a permanent ban and are reported to authorities."],
        ["Appeals", "A suspended account is told why and until when. If you think a decision is wrong, email us and a different person will look at it."],
        ["Your own controls", "Block anyone. Hide words and phrases from everything you see. Limit who can comment on your posts or message you. Mark posts \"Not interested\"."],
        ["Circles", "Circle admins moderate their own circles and can add stricter rules, but can't loosen these."],
        ["No filter is perfect", "It will miss things, and occasionally stop something harmless. Report what gets through, and tell us when it gets something wrong. The filter covers English only for now."],
      ],
    },
  ],
};

export const DOCUMENTS = [PRIVACY, TERMS, GUIDELINES, COOKIES, REFUNDS];
