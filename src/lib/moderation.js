// Content moderation for public text: hate speech, harassment and spam.
//
// The same checks apply to every group and every side. Criticism of ideas,
// religions, countries and policies is allowed; attacks on people for who
// they are aren't.
//
// Outcomes (see assessText):
//   block       slurs, dehumanising generalisations, calls for violence or
//               exclusion, "go back to your country", self-harm incitement
//   borderline  mockery and blanket insults: posted, but not recommended to
//               non-followers and collapsed in comments
//   quoted      abuse quoted to report or condemn it: posted behind a warning
//   ok          everything else, including negation and counter-speech
//
// Text is normalised first (homoglyphs, accents, zero-width chars, leetspeak,
// stretching, separators). Unambiguous slurs are also enforced by the rules
// (hateFree); the contextual checks here have no server-side equivalent.
// Private messages aren't checked.

// Normalisation

const HOMOGLYPHS = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
  "ԁ": "d", "ɡ": "g", "ո": "n", "ı": "i", "ο": "o", "α": "a", "ν": "v", "κ": "k", "τ": "t", "ρ": "p",
  "ε": "e", "ι": "i", "υ": "u", "ѵ": "v", "һ": "h", "ӏ": "l", "ԛ": "q", "ԝ": "w",
};
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i", "€": "e" };

export function normalize(text) {
  let t = String(text || "").normalize("NFKC").toLowerCase();
  t = t.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, "");
  t = [...t].map((c) => HOMOGLYPHS[c] ?? c).join("");
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return t.replace(/[’‘`´]/g, "'").replace(/\s+/g, " ");
}

// Patterns run against the text as written and with leetspeak decoded, since
// decoding alone would mangle punctuation ("dirty!" -> "dirtyi").
function variants(text) {
  const plain = normalize(text);
  const leet = plain.replace(/[0134578@$!|€]/g, (c) => LEET[c] ?? c);
  return plain === leet ? [plain] : [plain, leet];
}

const B = "(?<![a-z])"; // not preceded by a letter
const E = "(?![a-z])"; // not followed by a letter

// Tolerates stretching, censored vowels and (for longer words) separators.
function slurPattern(word, { gaps = word.replace(/ /g, "").length >= 5 } = {}) {
  const sep = gaps ? "[\\s._\\-*]?" : "";
  return word
    .split(" ")
    .map((part) => [...part].map((c) => (/[aeiou]/.test(c) ? `[${c}*]+` : `${c}+`)).join(sep))
    .join("[\\s._\\-]*");
}

// Slurs

const SLURS = [
  // South Asian
  "paki", "pajeet", "curry muncher", "curry nigger", "street shitter", "dothead", "dot head", "cow piss drinker",
  "cowpisser", "poo in loo", "poo in the loo", "designated shitting street", "bobs and vagene", "bobs and vegana",
  // Black
  "nigger", "nigga", "jigaboo", "porch monkey", "jungle bunny", "sambo", "golliwog", "darkie",
  // Aboriginal and Torres Strait Islander, Pacific
  "boong",
  // East and Southeast Asian
  "gook", "zipperhead", "slant eye", "ching chong",
  // Latino
  "wetback", "beaner",
  // Jewish
  "kike", "oven dodger",
  // Muslim, Arab, Sikh
  "raghead", "towelhead", "sand nigger", "muzrat", "muzzie", "camel jockey", "diaper head", "goat fucker",
  // Roma and Travellers
  "gyppo", "pikey",
  // Indigenous peoples of the Americas
  "prairie nigger",
  // white and European
  "honky", "white trash", "wop", "dago", "polack",
  // LGBTQ+
  "faggot", "shemale", "troon",
  // disability
  "retard", "retarded", "spastic", "spaz", "mongoloid",
];

// Also ordinary words; blocked unless the surrounding words make the benign sense clear.
const CONTEXTUAL = [
  { term: "coon", innocent: /\bcoon (cheese|hound|hounds|hunting|dog|dogs|skin)\b|\bcoonhound/ },
  { term: "abo", innocent: /\babo (blood|group|groups|type|types|system|antigen|antigens|incompatib\w*|compatib\w*)\b/ },
  { term: "chink", innocent: /\bchinks? (in|of) (the|his|her|their|my|your|our|its|an?)\b|\bchink of light\b/ },
  { term: "spic", innocent: /\bspic (and|n|&) span\b/ },
  { term: "fag", innocent: /\bfag (end|ends|break|packet)\b|\b(pack|packet|box|carton|smoke|smoked) of fags\b|\bfags? (and|&) (beer|booze|lighter)/ },
  { term: "tranny", innocent: /\btranny (fluid|oil|cooler|rebuild|service|pan|mount|flush)\b|\b(auto|manual|car|ute|truck|4wd|gearbox|diff) tranny\b/ },
  { term: "cracker", innocent: /\b(barrel|cream|fire|nut|safe|code|jack|graham|water|cheese|christmas|rice|prawn|animal|soda|salt|holiday)\s?crackers?\b|\bcrackers? (barrel|jack|and|with)\b/ },
  { term: "redskin", innocent: /\bredskin (potato|potatoes|peanuts?|lollies|lolly)\b/ },
  { term: "dyke", innocent: /\b(the|a|dutch|sea|river|flood|stone|earth)\s(dyke|dykes)\b|\bdyke (wall|road|lane)\b/ },
];

// Groups

// Identity groups. Every template applies to every entry.
const PEOPLE = [
  "indians?", "pakistanis?", "bangladeshis?", "sri lankans?", "nepalis?", "nepalese", "afghans?", "tamils?", "punjabis?",
  "asians?", "chinese", "japanese", "koreans?", "vietnamese", "filipin[oa]s?", "thais?", "indonesians?", "malaysians?",
  "africans?", "blacks", "black (?:people|folks?|men|women|guys|kids)", "whites", "white (?:people|folks?|men|women|guys|kids)",
  "brown (?:people|folks?|men|women|guys)", "arabs?", "muslims?", "hindus?", "sikhs?", "jews", "jewish (?:people|men|women)",
  "christians?", "catholics?", "buddhists?", "atheists?", "mexicans?", "latin[oax]s?", "hispanics?",
  "aboriginals?", "aborigines?", "aboriginal (?:people|australians?)", "indigenous (?:people|australians?)",
  "first nations (?:people|australians?)", "torres strait islanders?", "pacific islanders?", "islanders", "maoris?",
  "samoans?", "tongans?", "fijians?", "europeans?", "brits", "british (?:people|men|women)", "poms", "pommies",
  "english (?:people|men|women)", "irish (?:people|men|women)", "italians?", "greeks?", "lebanese", "turks", "persians?",
  "iranians?", "iraqis?", "syrians?", "israelis?", "palestinians?", "somalis?", "sudanese", "nigerians?", "ethiopians?",
  "russians?", "ukrainians?", "americans?", "australians?", "aussies?", "canadians?", "roma", "gypsies",
  "immigrants?", "migrants?", "refugees?", "foreigners?", "asylum seekers?",
  "gays", "gay (?:people|men|guys)", "lesbians?", "trans (?:people|women|men|folks?|kids)", "transgender (?:people|women|men|kids)",
  "bisexuals?", "queers", "queer (?:people|folks?)", "disabled (?:people|kids)", "autistic (?:people|kids)",
  "women", "men", "females", "males",
];

// Political identities: only violence and dehumanisation are checked.
const POLITICAL = [
  "leftists?", "lefties", "liberals?", "libs", "conservatives?", "right[- ]?wingers?", "left[- ]?wingers?",
  "republicans?", "democrats?", "labor voters?", "liberal voters?", "greens voters?", "greenies", "communists?",
  "socialists?", "capitalists?", "zionists?", "feminists?", "boomers?", "zoomers?",
];

const alt = (list) => `(?:${list.join("|")})`;
const PEOPLE_RE = alt(PEOPLE);
const ANY_GROUP_RE = alt([...PEOPLE, ...POLITICAL]);

// As an object ("I hate X", "kill X"), singular/adjective forms only count
// when not followed by a noun ("I hate Indian traffic" is fine). Plurals
// always count.
const ADJECTIVE_FORMS = new Set(["chinese", "japanese", "vietnamese", "lebanese", "sudanese", "nepalese"]);
const pluralOf = (e) => e.replace(/s\?$/, "s");
const singularOf = (e) => e.replace(/s\?$/, "");
const OK_NEXT = "(?:and|or|too|people|lol|lmao|here|there|now|again|who|that|because|cause|coz|cos|in|from|out|away|off|all|everywhere|anymore|forever)";
const objectForm = (list) => {
  const plural = [];
  const single = [];
  for (const e of list) {
    if (/s\?$/.test(e)) { plural.push(pluralOf(e)); single.push(singularOf(e)); }
    else if (ADJECTIVE_FORMS.has(e)) single.push(e);
    else plural.push(e);
  }
  return `(?:${alt(plural)}|${alt(single)}(?!\\s+(?!${OK_NEXT}${E})[a-z]))`;
};
const PEOPLE_OBJ = objectForm(PEOPLE);
const ANY_GROUP_OBJ = objectForm([...PEOPLE, ...POLITICAL]);

// Dehumanising terms.
const DEHUMANISING = [
  "animals?", "beasts?", "vermin", "rats", "roaches", "cockroaches", "parasites?", "leeches", "maggots", "insects",
  "sub[- ]?humans?", "not (?:even )?human", "less than human", "savages?", "barbarians", "apes", "monkeys?", "gorillas?",
  "pigs", "dogs", "rodents", "filth", "filthy", "dirty", "disgusting", "smelly", "stinky", "unclean", "diseased",
  "(?:a )?(?:disease|cancer|plague|virus|infestation)", "trash", "garbage", "rubbish", "scum", "inferior", "invaders",
  "rapists", "terrorists", "criminals", "thieves", "scammers", "pedos?", "paedos?", "pedophiles", "paedophiles",
];

// Blanket insults (borderline).
const INSULTING = [
  "stupid", "dumb", "idiots?", "morons?", "retards?", "brainless", "lazy", "ugly", "useless", "worthless",
  "annoying", "cringe", "losers?", "clowns?", "the worst",
];

const FILLER = "(?:(?:all|so|just|literally|such|basically|fucking|fkn|fuckin|freaking|really|truly|always|naturally|mostly|nothing but|a bunch of|a pack of|like)\\s+)*";
const DET = "(?:(?:all|every|most|these|those|the|them|you|ya|u|of)\\s+){0,3}";
const IS = "(?:are|r|is|=|be|become|remain|were|was|all)";
const VIOLENT = "(?:kill|murder|gas|shoot|exterminate|eradicate|slaughter|lynch|hang|burn|nuke|bomb|stab|behead|wipe out|get rid of|eliminate|genocide|ethnically cleanse|purge|sterili[sz]e)";
const EXCLUDE = "(?:deport|expel|kick out|throw out|send back|ban)";
const OUTCOME = "(?:die|be killed|be gassed|be shot|be exterminated|be wiped out|burn|hang|be hanged|be hung|be lynched|not exist|be sterili[sz]ed|be deported|be kicked out|go back|get out|leave (?:the country|australia|our country))";

const re = (src) => new RegExp(src, "i");

const BLOCK_PATTERNS = [
  // "X are vermin", "all X are just animals"
  { category: "dehumanising", re: re(`${B}${DET}${ANY_GROUP_RE}\\s+${IS}\\s+${FILLER}(?:a |an |the )?${alt(DEHUMANISING)}${E}`) },
  // "filthy X", "dirty X"
  { category: "dehumanising", re: re(`${B}(?:dirty|filthy|smelly|stinky|subhuman|savage|disgusting|inferior)\\s+${PEOPLE_OBJ}${E}`) },
  // "kill all X", "gas the X"
  { category: "violence", re: re(`${B}${VIOLENT}\\s+${DET}${FILLER}${ANY_GROUP_OBJ}${E}`) },
  // "X should die", "X need to be deported"
  { category: "violence", re: re(`${B}${ANY_GROUP_RE}\\s+(?:should|must|need to|needs to|deserve to|deserves to|ought to|gotta|have to|oughta)\\s+(?:all\\s+)?${OUTCOME}${E}`) },
  // "deport all X", "ban every X"
  { category: "exclusion", re: re(`${B}${EXCLUDE}\\s+(?:all|every|the|these|those|them)\\s+${FILLER}${PEOPLE_OBJ}${E}`) },
  // "X don't belong here", "no X allowed"
  { category: "exclusion", re: re(`${B}${PEOPLE_RE}\\s+(?:don'?t|do not|dont|doesn'?t) belong(?: (?:here|in (?:this country|australia|the west|our country)))?${E}`) },
  { category: "exclusion", re: re(`${B}no\\s+${PEOPLE_OBJ}\\s+(?:allowed|welcome|wanted)${E}`) },
  // "I hate X" (people, not ideas: "I hate Islam" isn't this)
  { category: "hatred", re: re(`${B}(?:i|we|everyone)\\s+(?:fucking\\s+)?(?:hate|despise|loathe|can'?t stand|cannot stand)\\s+${DET}${FILLER}${PEOPLE_OBJ}${E}`) },
  // "X smell", "X breed like rats"
  { category: "dehumanising", re: re(`${B}${PEOPLE_RE}\\s+(?:all\\s+)?(?:smell|stink|reek)s?${E}`) },
  { category: "dehumanising", re: re(`${B}${PEOPLE_RE}\\s+(?:breed|multiply)\\s+like\\s+(?:rats|rabbits|cockroaches|roaches|insects|animals)${E}`) },
  { category: "dehumanising", re: re(`${B}(?:bat|dog|cat|rat)[\\s-]?eaters?${E}`) },
  // "go back to your country", "go back where you came from"
  { category: "xenophobia", re: re(`${B}go\\s+back\\s+to\\s+(?:your|ur|yo|ya|their|his|her)\\s+(?:own\\s+)?(?:country|countries|village|jungle|cave|desert|hut|shithole|hellhole|curry\\s?land|slum|people|kind)${E}`) },
  { category: "xenophobia", re: re(`${B}go\\s+back\\s+to\\s+(?:curry\\s?land|poo\\s?land|pajeet\\s?land|chinkland|shithole\\s?(?:country|land)?)${E}`) },
  { category: "xenophobia", re: re(`${B}go\\s+back\\s+(?:home\\s+)?(?:to\\s+)?where\\s+(?:you|u|they|he|she)\\s+(?:came|come|belong)\\s+from${E}`) },
  { category: "xenophobia", re: re(`${B}(?:you|u|they)\\s+(?:smell|stink)s?\\s+(?:like|of)\\s+curry${E}`) },
  // self-harm incitement
  { category: "harassment", re: re(`${B}(?:kys|k y s|kill (?:your ?self|urself|yourselves)|neck (?:your ?self|urself)|go die|hope (?:you|u) die|drink bleach)${E}`) },
];

const BORDERLINE_PATTERNS = [
  // blanket insults about a group
  { category: "insult", re: re(`${B}${DET}${PEOPLE_RE}\\s+${IS}\\s+${FILLER}(?:a |an |the )?${alt(INSULTING)}${E}`) },
  // coded or loaded terms
  { category: "coded", re: re(`${B}(?:kung flu|china virus|wuhan virus)${E}`) },
  { category: "coded", re: /\({3}\s*[^()]{1,40}\s*\){3}/ },
  { category: "coded", re: re(`${B}(?:saar|saaar+|sirs? pls|redeem(?:ed)? sir|bloody bastard benchod)${E}`) },
];

// Mockery: group + stereotype + laughter together (borderline).
const STEREOTYPE_RE = re(`${B}(?:curry|smell\\w*|stink\\w*|scam\\w*|call ?cent(?:er|re)|tech support|street|toilet|poo|shit\\w*|cows?|cow piss|bats?|dogs?|dog meat|rice|chopsticks|accent|sirs?|needful|bobs|vagene|taco|burrito|cartel|terrorists?|bombs?|camels?|sand|oven|shekels?|nose|welfare|centrelink|dole|petrol|goon|boat people|monkeys?|bananas?|watermelon|fried chicken)${E}`);
const LAUGH_RE = /(😂|🤣|💀|😹|😆|(?<![a-z])(?:lmao+|lmfao+|lol+|rofl|kek|haha+|hehe+|xd)(?![a-z]))/i;
const PEOPLE_ONLY_RE = re(`${B}${PEOPLE_RE}${E}`);

// Context. Each match is read within its sentence:
//   negated     "not all X are terrorists"
//   condemned   "saying X are vermin is racist"
//   reported    "he called me a paki"
//   in-group    "we Indians are always late lol"
//   endorsed    laughter, "facts", "based": overrides the three above

// Negation only counts immediately before the claim ("not gonna lie, X are
// dirty" isn't negated); framing phrases count anywhere earlier.
const NEGATION_NEAR_RE = re(`${B}(?:not|never|isn'?t|aren'?t|wasn'?t|weren'?t)\\s+$`);
const NEGATION_FAR_RE = re(`${B}(?:myth that|false that|lie that|stereotype that|untrue that|wrong to (?:say|think|claim)|stop saying|quit saying|don'?t say|dont say|stop calling|don'?t call|nobody should say|racist to say|doesn'?t mean)${E}`);
const CONDEMN_RE = re(`${B}(?:racist|racism|racists|xenophob\\w*|bigot\\w*|hate speech|hateful|slurs?|offensive|unacceptable|not (?:okay|ok|cool|funny|acceptable)|shameful|ignorant|prejudice\\w*|discriminat\\w*|stereotyp\\w*|hurtful|abus(?:e|ed|ive)|harass\\w*|called (?:it )?out|stand (?:up )?(?:against|to)|so tired of|sick of|fed up|had enough of|why do people|people who say|stop calling|stop saying|don'?t call|wrong to say|reported (?:him|her|them|it))${E}`);
const REPORT_RE = re(`${B}(?:called (?:me|us|him|her|them|my|our|his|their)|call(?:s|ing)? (?:me|us|him|her|them)|got called|was called|were called|being called|keeps? calling|kept calling|(?:said|says|saying|told (?:me|us|him|her|them)(?: to)?|yelled|shouted|screamed|wrote|commented|messaged|texted|dm'?d|posted|replied)${E}|someone said|heard (?:someone|a guy|a man|a woman|him|her|them))`);
const ENDORSE_RE = /(😂|🤣|💀|😹|😆|👌|💯|(?<![a-z])(?:lmao+|lmfao+|lol+|rofl|kek|haha+|facts|based|so true|true tho|it'?s true|the truth|he'?s right|she'?s right|they'?re right|not wrong|agree|exactly|100%|ngl|fr fr|real talk|just saying|just sayin|no offen[cs]e|(?:i'?m )?not (?:being |trying to be )?(?:a )?racist|call me (?:a )?racist)(?![a-z]))/i;
const INGROUP_BEFORE_RE = re(`${B}(?:we|us)\\s+(?:all\\s+)?$`);
const AS_A_RE = re(`${B}as an?\\s+(?:${PEOPLE.map((e) => e.replace(/s\?$/, "")).join("|")})${E}`);
const FRIENDLY_RE = re(`${B}(?:my|ma|mah|wassup|sup|yo)\\s+$`);

function around(v, index, length) {
  const stops = /[.!?\n]/g;
  let start = 0;
  let m;
  while ((m = stops.exec(v)) && m.index < index) start = m.index + 1;
  stops.lastIndex = index + length;
  const next = stops.exec(v);
  const end = next ? next.index : v.length;
  // Condemnation may follow in the next sentence.
  stops.lastIndex = end + 1;
  const after = stops.exec(v);
  const windowEnd = v.length <= 280 ? v.length : after ? after.index : v.length;
  return {
    before: v.slice(start, index),
    sentence: v.slice(start, end),
    window: v.length <= 280 ? v : v.slice(start, windowEnd),
  };
}

function contextOf(v, index, length) {
  const { before, sentence, window } = around(v, index, length);
  const quotesBefore = (before.match(/["“”]/g) || []).length;
  const inQuotes = quotesBefore % 2 === 1;
  return {
    negated: NEGATION_NEAR_RE.test(before.slice(-12)) || NEGATION_FAR_RE.test(before),
    condemned: CONDEMN_RE.test(window),
    reported: REPORT_RE.test(before) || (inQuotes && REPORT_RE.test(sentence)),
    endorsed: ENDORSE_RE.test(window),
    ingroup: INGROUP_BEFORE_RE.test(before) || AS_A_RE.test(v),
    friendly: FRIENDLY_RE.test(before.slice(-12)),
  };
}

function judge(kind, c) {
  if (kind === "attack") {
    if (c.negated || (c.condemned && !c.endorsed)) return "ok";
    if ((c.reported || c.ingroup) && !c.endorsed) return "borderline";
    return "block";
  }
  if (kind === "slur") {
    if ((c.condemned || c.reported || c.friendly) && !c.endorsed) return "quoted";
    return "block";
  }
  if (kind === "harassment") {
    if (c.reported && !c.endorsed) return "quoted";
    return "block";
  }
  // borderline patterns: blanket insults, coded terms, mockery
  if (c.negated || c.condemned || c.ingroup) return "ok";
  return "borderline";
}

// Assessment

const SLUR_RES = SLURS.map((w) => re(`${B}${slurPattern(w)}(?:e?s)?${E}`));
const CONTEXTUAL_RES = CONTEXTUAL.map(({ term, innocent }) => ({ re: re(`${B}${slurPattern(term, { gaps: false })}(?:e?s)?${E}`), innocent }));
const g = (r) => new RegExp(r.source, `${r.flags.replace("g", "")}g`);
const RANK = { ok: 0, quoted: 1, borderline: 2, block: 3 };

/**
 * @returns {{ level: "block"|"borderline"|"quoted"|"ok", category?: string, matched?: string }}
 * `matched` is for moderators only; never show it to the author.
 */
export function assessText(text) {
  if (!text || !String(text).trim()) return { level: "ok" };
  let worst = { level: "ok" };
  const consider = (level, category, matched) => {
    if (RANK[level] > RANK[worst.level]) worst = { level, category, matched };
  };
  for (const v of variants(text)) {
    const scan = (regex, kind, category, innocent) => {
      for (const m of v.matchAll(g(regex))) {
        if (innocent && innocent.test(v)) continue;
        consider(judge(kind, contextOf(v, m.index, m[0].length)), category, m[0]);
        if (worst.level === "block") return;
      }
    };
    for (const r of SLUR_RES) { scan(r, "slur", "slur"); if (worst.level === "block") return worst; }
    for (const { re: r, innocent } of CONTEXTUAL_RES) { scan(r, "slur", "slur", innocent); if (worst.level === "block") return worst; }
    for (const p of BLOCK_PATTERNS) {
      scan(p.re, p.category === "harassment" ? "harassment" : "attack", p.category);
      if (worst.level === "block") return worst;
    }
    for (const p of BORDERLINE_PATTERNS) scan(p.re, "soft", p.category);
    if (PEOPLE_ONLY_RE.test(v) && STEREOTYPE_RE.test(v) && LAUGH_RE.test(v)) {
      const m = v.match(PEOPLE_ONLY_RE);
      const c = contextOf(v, m.index, m[0].length);
      consider(c.condemned || c.ingroup ? "ok" : "borderline", "mockery");
    }
  }
  return worst;
}

export function isBorderline(text) {
  return assessText(text).level !== "ok";
}

const BLOCK_MESSAGES = {
  slur: "That includes a slur. Mesh blocks slurs against every group, equally. If you're describing something said to you or calling it out, say so and it can post behind a warning.",
  dehumanising: "That describes a whole group of people as less than human. Criticise ideas, governments or behaviour all you like; attacks on people for who they are aren't allowed, whichever group it is.",
  violence: "That calls for harm against a group of people. That's not allowed on Mesh, against anyone.",
  exclusion: "That calls for a whole group of people to be shut out for who they are. Debate policy all you like; targeting a group isn't allowed.",
  hatred: "That expresses hatred for a whole group of people. You can criticise beliefs, governments and ideas; not people for who they are.",
  xenophobia: "That tells someone they don't belong because of where they or their family are from. Everyone belongs here.",
  harassment: "Telling someone to hurt themselves isn't allowed. If you or someone you know is struggling, Lifeline is on 13 11 14.",
};

export function blockMessage(category) {
  return BLOCK_MESSAGES[category] || BLOCK_MESSAGES.dehumanising;
}

export const BORDERLINE_NOTE =
  "This might come across as mocking a group. You can still post it, but Mesh won't recommend it to people who don't follow you.";

export const QUOTED_NOTE =
  "This quotes offensive language. It'll post, and people will see a warning and tap to read it.";

// Hidden words

export function hitsHiddenWords(text, words) {
  if (!words?.length || !text) return false;
  const vs = variants(text);
  return words.some((w) => {
    const needle = normalize(w).trim();
    if (!needle) return false;
    const r = new RegExp(`${B}${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${E}`, "i");
    return vs.some((v) => r.test(v));
  });
}

// Spam and cooldowns

const URL_RE = /https?:\/\/|www\./gi;

export function looksLikeSpam(text) {
  const t = String(text || "");
  if ((t.match(URL_RE) || []).length > 4) return "Too many links.";
  if (/(.)\1{14,}/.test(t)) return "That looks like keyboard spam.";
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 40 && letters === letters.toUpperCase()) return "Ease off the caps lock.";
  return null;
}

// Slightly longer than the rules' gaps (10s posts, 3s comments) so the client
// explains the wait before the server refuses.
const COOLDOWN_MS = { comment: 4000, default: 15000 };

// localStorage may be unavailable; fail open.
function readKey(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function writeKey(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage blocked */ }
}

export function postingCooldown(key = "post") {
  const last = Number(readKey(`mesh:last:${key}`) || 0);
  const wait = (COOLDOWN_MS[key] ?? COOLDOWN_MS.default) - (Date.now() - last);
  if (wait > 0) return Math.ceil(wait / 1000);
  return 0;
}

// Call only after a successful write, so a retry isn't flagged as a duplicate.
export function markPosted(key = "post", text = "") {
  writeKey(`mesh:last:${key}`, String(Date.now()));
  if (text) writeKey(`mesh:lasttext:${key}`, String(text));
}

export function duplicateOfLast(text, key = "post") {
  const prev = readKey(`mesh:lasttext:${key}`);
  return prev !== null && prev === String(text || "") && String(text || "").trim().length > 0;
}

// Combined check

/**
 * Pre-submit check. Returns `{ error }`, or `{ ok, note, sensitive }`: show
 * `note` and require confirmation; persist `sensitive` with the content.
 * `allowQuoted` is for posts and comments only. `hate: false` skips the hate
 * checks (private messages).
 */
export function checkContent(text, { key = "post", skipCooldown = false, allowQuoted = false, hate = true } = {}) {
  const verdict = hate ? assessText(text) : { level: "ok" };
  if (verdict.level === "block" || (verdict.level === "quoted" && !allowQuoted)) {
    return { error: blockMessage(verdict.category), category: verdict.category };
  }
  const spam = looksLikeSpam(text);
  if (spam) return { error: spam };
  if (!skipCooldown) {
    const wait = postingCooldown(key);
    if (wait > 0) return { error: `Slow down. You can post again in ${wait}s.` };
    if (duplicateOfLast(text, key)) return { error: "You just posted exactly that." };
  }
  return {
    ok: true,
    borderline: verdict.level === "borderline",
    quoted: verdict.level === "quoted",
    sensitive: verdict.level !== "ok",
    note: verdict.level === "borderline" ? BORDERLINE_NOTE : verdict.level === "quoted" ? QUOTED_NOTE : "",
  };
}

export function checkName(text) {
  const verdict = assessText(text);
  // Names have no surrounding context, so any flag rejects.
  if (verdict.level !== "ok") {
    return { error: "That name contains language that isn't allowed on Mesh." };
  }
  return { ok: true };
}
