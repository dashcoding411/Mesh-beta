// Prints the two regexes used by hateFree() in firestore.rules.
//
// The rules language has no look-behind and no text normalisation, so the
// server enforces only slurs that have no innocent meaning, with common
// disguises (leetspeak digits, stretched letters, a censoring *). The fuller,
// contextual checks live in src/lib/moderation.js and run in the app.
//
// After changing a list: node scripts/rules-slur-regex.mjs, paste the output
// into hateFree() in firestore.rules, then deploy the rules.

// Matched anywhere, even inside other words.
const ANYWHERE = [
  "nigger", "nigga", "faggot", "pajeet", "currymuncher", "curry muncher", "streetshitter", "street shitter",
  "pooinloo", "poo in loo", "poo in the loo", "porchmonkey", "porch monkey", "junglebunny", "jungle bunny", "jigaboo",
  "zipperhead", "chingchong", "ching chong", "wetback", "raghead", "towelhead", "muzrat", "diaperhead",
  "goatfucker", "goat fucker", "ovendodger", "oven dodger", "shemale", "bobs and vagene",
];
// Matched only as whole words (plural allowed).
const WHOLE_WORD = ["paki", "kike", "gook", "boong", "gyppo", "honky", "dothead", "troon", "muzzie", "beaner", "polack", "femoid", "foid"];

// Also caught when spelled out with a space or dot between every letter
// ("n i g g a"). Only for words where that can't be an innocent phrase:
// "she male" or "wet back" can be, so those aren't in this list.
const SPACED = ["nigger", "nigga", "faggot", "pajeet", "jigaboo"];

const CLASS = { a: "[a4@*]", e: "[e3*]", i: "[i1!|*]", o: "[o0*]", s: "[s5$]", g: "[g9]", t: "[t7]", b: "[b8]" };
const letter = (c) => (c === " " ? "[ ._-]*" : `${CLASS[c] || c}+`);
const pattern = (w) => [...w].map(letter).join(SPACED.includes(w) ? "[ ._*-]?" : "");

const anywhere = `(?s).*(${ANYWHERE.map(pattern).join("|")}).*`;
const whole = `(?s)(.*[^a-z])?(${WHOLE_WORD.map(pattern).join("|")})(e?s)?([^a-z].*)?`;
console.log(anywhere);
console.log(whole);
