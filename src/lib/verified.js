/**
 * Throwaway inboxes: anyone can read them, or they're gone within the hour,
 * so confirming one proves nothing about a person, and bot farms confirm
 * accounts with them by the thousand. A confirmed one doesn't count (the
 * rules' throwawayEmail has the same list; a test keeps them in step).
 * Privacy relays (Hide My Email, Firefox Relay, DuckDuckGo, SimpleLogin)
 * reach a real person and are fine.
 */
export const THROWAWAY_DOMAINS = [
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "spam4.me", "10minutemail.com", "10minutemail.net", "temp-mail.org", "temp-mail.io",
  "tempmail.com", "tempmail.net", "tempmailo.com", "tempinbox.com", "tempr.email", "yopmail.com", "yopmail.net",
  "yopmail.fr", "trashmail.com", "trashmail.de", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc",
  "mailnesia.com", "mintemail.com", "mohmal.com", "throwawaymail.com", "fakeinbox.com", "emailondeck.com",
  "mailcatch.com", "mytemp.email", "tmpmail.org", "tmpmail.net", "moakt.com", "emailfake.com", "fakemail.net",
  "mail.tm", "mail.gw", "inboxkitten.com", "1secmail.com", "1secmail.net", "1secmail.org", "dropmail.me",
  "discard.email", "mailpoof.com", "linshiyouxiang.net",
];

/** True for an address at a throwaway inbox, or any address under one. */
export function isThrowawayEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  return THROWAWAY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Whether a signed-in account has a confirmed email (not a throwaway one) or
 * a phone number. Google and Apple sign-ins come confirmed; email-and-password
 * ones need the link. The rules need it to post, comment, message or follow
 * (verifiedContact).
 */
export const isVerifiedUser = (user) => !!user
  && (!!user.phoneNumber || (!!user.emailVerified && !isThrowawayEmail(user.email)));
