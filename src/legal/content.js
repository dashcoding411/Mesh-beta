import { BUSINESS } from "./business";

/* These documents describe what the code in this repository actually does.
   If you change what data is collected, who it is shared with, or how long it
   is kept, change these too — a policy that does not match the system is worse
   than no policy, because it becomes a misleading representation.

   They are drafts prepared without legal advice. Have a lawyer admitted in
   your jurisdiction review them before launch. */

const B = BUSINESS;
const OPERATOR = `${B.legalName} (ABN ${B.abn}), trading as ${B.tradingName}`;

export const PRIVACY = {
  id: "privacy",
  title: "Privacy Policy",
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
        ["Account details", "Your email address, or your phone number if you sign in by SMS. If you use Google or Apple sign-in, we receive the email address and name they release to us — nothing else."],
        ["Profile", "Your handle, display name, and anything you choose to add: bio, pronouns, town, birth year, profile picture, relationship link."],
        ["Birth year", "Collected to apply legal age protections. See 'Age' below."],
        ["Content", "Posts, photos, videos, captions, comments, messages, circle membership, gathering RSVPs, and news submissions with their sources."],
        ["Interaction signals", "Which accounts you follow, like, comment on, save, send, hide or report. These are used to order your feed and suggest accounts."],
        ["Technical", "Your last-active timestamp, so people you message can see whether you are online."],
      ],
      p: [
        "We do not collect your contacts, your location, your device identifiers, or your browsing activity on other sites. We do not buy personal information from data brokers.",
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
        ["To show you content", "Ordering your feed and suggesting accounts, using the interaction signals above."],
        ["To keep Mesh safe", "Filtering hate speech and spam, rate-limiting posting, handling reports, and enforcing circle rules."],
        ["To meet legal obligations", "Responding to lawful requests and to the eSafety Commissioner where required."],
      ],
    },
    {
      h: "Who can see what",
      list: [
        ["Public posts", "Visible to anyone signed in to Mesh."],
        ["Followers-only posts", "Visible to you and the people who follow you. Enforced on our servers, not only in the app."],
        ["Circle posts", "Visible according to that circle's privacy setting."],
        ["Messages", "Visible only to the people in that conversation. We can technically access message records to respond to a lawful request or a safety report; we do not read them otherwise."],
        ["Your saved posts, hidden posts, and interaction signals", "Visible only to you."],
      ],
    },
    {
      h: "Who we share it with",
      p: [
        "Mesh runs on Google Firebase (Authentication, Cloud Firestore, Cloud Storage). Google processes this data on our behalf as our service provider.",
        "Your Firestore data is stored in Google's australia-southeast1 region (Sydney). Uploaded media is currently stored in the United States, which means that data is transferred overseas — Australian Privacy Principle 8 applies to that transfer.",
        "If you sign in with Google or Apple, that provider knows you signed in to Mesh. If you use phone sign-in, Google reCAPTCHA runs to verify you are not a bot; that check sends data to Google and is only loaded at the moment you request an SMS code.",
        "We otherwise disclose personal information only where we are legally required to, or where it is necessary to prevent a serious threat to someone's life, health or safety.",
      ],
    },
    {
      h: "Age",
      p: [
        "Mesh is not intended for children under 13, and we do not knowingly create accounts for them.",
        "Australia restricts accounts on age-restricted social media platforms for people under 16. We collect birth year and apply restrictions to accounts under 16. If you believe an account belongs to someone under the minimum age, report it and we will act.",
        "We are actively reviewing our obligations under the Online Safety Amendment (Social Media Minimum Age) Act 2024 and will update this policy as our approach is finalised.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "We keep your account data for as long as your account exists. Deleting your account removes your profile, posts and handle.",
        "Messages you have sent may remain visible to the people you sent them to, in the same way a sent text message does. Use unsend to remove an individual message for everyone.",
        "Backups and server logs may persist for a short period after deletion before being overwritten.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "You can access everything we hold about you: Account → Your data → Download gives you a JSON export immediately, with no request needed.",
        "You can correct your profile at any time from Profile → Edit profile.",
        "You can delete your account permanently from Account → Danger zone.",
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
  title: "Terms of Service",
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
        "Where AI-generated media could reasonably be mistaken for a real depiction of real people or events, label it.",
        "News submissions must be factual. Fabricated sources, invented quotes and AI-generated 'evidence' are grounds for removal and account termination.",
      ],
    },
    {
      h: "News on Mesh",
      p: [
        "Anyone can submit to the news section. Nobody can self-publish there.",
        "A submission needs a headline, the full script, and at least two source links. Submissions are held for human review against those sources before they appear, and are marked as reviewed once published.",
        "Review means a person has checked the submission against the sources provided. It is not a professional fact-checking certification, and it is not a guarantee that a story is true. Form your own view and follow the sources.",
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
        "You can delete your account at any time from Account → Danger zone. That is permanent.",
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
  title: "Cookies & Storage",
  summary:
    "Mesh uses browser storage to keep you signed in and to stop spam. There is no advertising or analytics tracking.",
  sections: [
    {
      h: "The short version",
      p: [
        "Mesh sets no advertising cookies and no analytics cookies. There is no third-party tracking on this site, and nothing here follows you to other websites.",
        "What we do store is the minimum needed to keep you signed in and to stop the same message being posted a hundred times a second.",
      ],
    },
    {
      h: "Exactly what is stored",
      list: [
        ["Your sign-in session", "Firebase Authentication stores a session token in your browser so you are not asked to sign in on every page load. Clearing it signs you out. Choosing 'Keep me signed in' stores it until you sign out; leaving it unticked stores it only until you close the tab."],
        ["Anti-spam timers", "A timestamp and your last post's text, stored locally under keys beginning 'mesh:', used to enforce the posting cooldown and catch duplicate posts. These never leave your device."],
        ["Google reCAPTCHA", "Only if you use phone sign-in. Google sets its own cookies to tell humans from bots. This does not load unless you request an SMS code."],
      ],
    },
    {
      h: "Why there is no consent banner",
      p: [
        "Consent requirements under EU and UK rules apply to storage that is not strictly necessary — analytics, advertising, profiling. Mesh has none of those, so there is nothing to ask you to opt into.",
        "The items above are either strictly necessary to provide a service you asked for, or are security measures. We tell you about them here rather than interrupting you with a banner that has no meaningful choice behind it.",
        "If we ever add analytics or any non-essential storage, we will ask first, and it will be off until you say yes.",
      ],
    },
    {
      h: "Controlling it",
      p: [
        "Your browser settings can block or clear all of this. Blocking storage for this site will sign you out and keep you signed out.",
        "Signing out from Account → Danger zone clears your session on this device.",
      ],
    },
  ],
};

export const REFUNDS = {
  id: "refunds",
  title: "Refunds & Billing",
  summary: "Mesh is free. There is nothing to charge or refund yet — here is what happens if that changes.",
  sections: [
    {
      h: "Right now",
      p: [
        "Mesh does not charge for anything. There are no subscriptions, no purchases, no tipping, and we do not store payment details. If a page ever asks you to pay for Mesh today, it is not us — do not enter card details, and tell us.",
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
        "If a paid feature has a major problem — it is unusable, substantially different from what was described, or unfit for its stated purpose — you are entitled to a refund, and you choose the remedy rather than us.",
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
  title: "Community Guidelines",
  summary: "What Mesh is for, and what gets you removed.",
  sections: [
    {
      h: "What Mesh is for",
      p: [
        "Mesh exists to make ordinary people's stories reachable without an advertising machine deciding which ones deserve an audience. We do not sell your attention, and we do not rank content by what pays best.",
      ],
    },
    {
      h: "The rules",
      list: [
        ["Do not attack people for who they are", "Hate speech targeting any group is removed. Our filters cover slurs against every group we know of — including ones many platforms overlook — but no filter is complete, so report what gets through."],
        ["Do not harass", "No targeted abuse, threats, or coordinated pile-ons."],
        ["Do not deceive", "No impersonation, no fabricated news, no AI-generated material passed off as real, no fake reviews or endorsements."],
        ["Do not post what is not yours", "Only post media you made or have permission to use."],
        ["Do not spam", "No engagement farming, bulk unsolicited messages, or scams."],
        ["Respect the age rules", "Do not help someone under the minimum age create an account."],
      ],
    },
    {
      h: "How enforcement works",
      p: [
        "First, automated filters block the clearest cases before they post. Then reports go to human review.",
        "Consequences scale: content removal, then feature restriction, then suspension, then permanent removal. Serious harms — child safety, credible threats — skip straight to the end and are reported to authorities.",
        "Circle admins moderate their own circles and can add stricter rules, but cannot loosen these.",
      ],
    },
  ],
};

export const DOCUMENTS = [PRIVACY, TERMS, GUIDELINES, COOKIES, REFUNDS];
