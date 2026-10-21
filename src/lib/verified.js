/**
 * Whether a signed-in account has a confirmed email or a phone number. Google
 * and Apple sign-ins come confirmed; email-and-password ones need the link.
 * The rules need it to post, comment, message or follow (verifiedContact).
 */
export const isVerifiedUser = (user) => !!user && (!!user.phoneNumber || !!user.emailVerified);
