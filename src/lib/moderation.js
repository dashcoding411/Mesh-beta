// Content moderation for public text: hate speech, harassment and spam.
//
// The same checks apply to every group and every side. Criticism of ideas,
// religions' teachings, countries and policies is allowed; attacks on people
// for who they are aren't, and calling a faith a disease or calling for it to
// be wiped out is an attack on everyone who follows it.
//
// Outcomes (see assessText):
//   block       slurs, dehumanising generalisations, putting down a group for
//               who they are (insults, stereotypes, coded terms, mockery),
//               conspiracy tropes about a group, calls for violence or
//               exclusion, threats against a person, "go back to your
//               country", self-harm incitement, rape threats and
//               victim-blaming, Nazi slogans and Holocaust denial
//   borderline  unclear targets ("those people...") and joking threats:
//               posted, but not recommended to non-followers and collapsed
//               in comments
// Insulting a person, a company, Mesh or a government is fine; roping in
// race, gender, sexuality, religion, disability or where someone's from isn't.
//   quoted      abuse quoted to report or condemn it: posted behind a warning
//   ok          everything else, including negation and counter-speech
//
// Text is normalised first (homoglyphs, accents, zero-width chars, leetspeak,
// stretching, separators). Unambiguous slurs are also enforced by the rules
// (hateFree); the contextual checks here have no server-side equivalent.
//
// A comment is read against the post it's on (`about`) and the thread around
// it (`thread`). "This is why Australia is falling" means nothing on a post
// about interest rates, and something else on one about a Muslim player. All
// of it runs on the device, when writing and again when reading, so a comment
// that got past the writer's check still folds for everyone who reads it.
// Private messages aren't filtered: the sender's device asks before sending
// something that would be blocked here (messageWarning), and a message
// request that would be is folded away on the recipient's (hideInRequest).
// Nothing about a message leaves the device for either.

// Normalisation

const HOMOGLYPHS = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
  "ԁ": "d", "ɡ": "g", "ո": "n", "ı": "i", "ο": "o", "α": "a", "ν": "v", "κ": "k", "τ": "t", "ρ": "p",
  "ε": "e", "ι": "i", "υ": "u", "ѵ": "v", "һ": "h", "ӏ": "l", "ԛ": "q", "ԝ": "w",
};
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i", "€": "e" };

export function normalize(text) {
  let t = String(text || "").normalize("NFKC").toLowerCase();
  t = t.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD]/g, "").replace(/\uFE0F/g, "");
  t = [...t].map((c) => HOMOGLYPHS[c] ?? c).join("");
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return t.replace(/[’‘`´]/g, "'").replace(/\s+/g, " ");
}

// Ways of hiding a word: "m u s l i m s", "m*slims", "muuuslims", and spellings
// that only look right ("isIam" lowercases to "isiam", "mus1ims" decodes to "musiims").
const HIDDEN_RE = /\*|([a-z])\1\1|(?:^|[^a-z])[a-z][ .\-_][a-z][ .\-_][a-z]|isiam|izlam|musiim|muzlim|mvslim|moslem/;
const RESPELT = { isiam: "islam", izlam: "islam", musiim: "muslim", muzlim: "muslim", mvslim: "muslim", moslem: "muslim" };
const CENSORED = ["muslims", "muslim", "islam", "jews", "jew", "blacks", "indians", "indian", "asians", "chinese", "women", "gays", "migrants", "immigrants", "refugees", "hindus", "sikhs", "christians", "aboriginals", "africans", "arabs"];
function uncover(v) {
  return v
    .replace(/(?<![a-z])(?:[a-z][ .\-_]){2,}[a-z](?![a-z])/g, (m) => m.replace(/[ .\-_]/g, ""))
    .replace(/[a-z*]*\*[a-z*]*/g, (w) => CENSORED.find((c) => c.length === w.length && [...w].every((ch, i) => ch === "*" || ch === c[i])) ?? w)
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/isiam|izlam|musiim|muzlim|mvslim|moslem/g, (m) => RESPELT[m]);
}

// Patterns run against the text as written, with leetspeak decoded (decoding
// alone would mangle punctuation: "dirty!" -> "dirtyi"), and with hidden words
// uncovered.
function variants(text) {
  const plain = normalize(text);
  const leet = plain.replace(/[0134578@$!|€]/g, (c) => LEET[c] ?? c);
  const read = plain === leet ? [plain] : [plain, leet];
  return [...read, ...read.filter((v) => HIDDEN_RE.test(v)).map(uncover)];
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
  "raghead", "towelhead", "sand nigger", "muzrat", "muzzie", "mudslime", "pisslam", "window licker", "camel jockey", "diaper head", "goat fucker",
  // Roma and Travellers
  "gyppo", "pikey",
  // Indigenous peoples of the Americas
  "prairie nigger",
  // white and European
  "honky", "white trash", "wop", "dago", "polack",
  // LGBTQ+
  "faggot", "shemale", "troon",
  // disability
  "spastic", "spaz", "mongoloid",
  // women
  "femoid", "foid",
];

// Also ordinary words; blocked unless the surrounding words make the benign sense clear.
const CONTEXTUAL = [
  { term: "coon", innocent: /\bcoon (cheese|hound|hounds|hunting|dog|dogs|skin)\b|\bcoonhound/ },
  { term: "abo", innocent: /\babo (blood|group|groups|type|types|system|antigen|antigens|incompatib\w*|compatib\w*)\b/ },
  { term: "chink", innocent: /\bchinks? (in|of) (the|his|her|their|my|your|our|its|an?)\b|\bchink of light\b/ },
  { term: "spic", innocent: /\bspic (and|n|&) span\b/ },
  { term: "fag", innocent: /\bfag (end|ends|break|packet)\b|\b(pack|packet|box|carton|smoke|smoked) of fags\b|\bfags? (and|&) (beer|booze|lighter)/ },
  { term: "tranny", innocent: /\btranny (fluid|oil|cooler|rebuild|service|pan|mount|flush)\b|\b(auto|manual|car|ute|truck|4wd|gearbox|diff) tranny\b/ },
  { term: "cracker", innocent: /\b(?:that|this|it|what|was|is|absolute|bloody|real|ripping|such)\s+(?:an?\s+)?(?:absolute\s+|bloody\s+|real\s+)?cracker\b|\bcracker of an?\b|\b(?:went|gone|going|go|drive|driving|drove|drives|you'?re|he'?s|she'?s|they'?re|are)\s+crackers\b|\b(barrel|cream|fire|nut|safe|code|jack|graham|water|cheese|christmas|rice|prawn|animal|soda|salt|holiday)\s?crackers?\b|\bcrackers? (barrel|jack|and|with)\b/ },
  { term: "redskin", innocent: /\bredskin (potato|potatoes|peanuts?|lollies|lolly)\b/ },
  { term: "retard", innocent: /\bretard (the|its|their|growth|ignition|timing|spark|progress|development|flow)\b/ },
  { term: "retarded", innocent: /\bretarded (growth|development|ignition|timing|spark|progress|flow|combustion|rate|ripening|corrosion|plants?|seedlings?)\b|\b(growth|ignition|timing|spark|development|ripening) (is |was |were |are |gets |got )?retarded\b/ },
  { term: "roastie", innocent: /\b(crispy|crunchy|golden|duck fat|goose fat|potato(es)?|spuds?|gravy|roast (dinner|lunch|beef|lamb|chicken|pork)|sunday roast|oven|yorkshire|pudding|lamb|carrots|parsnips|veggies|veg|dinner|lunch)\b/ },
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

// Where someone's from or what they believe, in adjective form ("an Indian
// invasion"), and the plurals "too many X here" is said about.
const ORIGIN_ADJ = "(?:indian|pakistani|asian|chinese|african|black|arab|muslim|islamic|jewish|hindu|sikh|migrant|immigrant|refugee|mexican|latino|lebanese|sudanese|somali|afghan|third[- ]world|brown|non[- ]?white|curry)";
const XENO_OBJ = "(?:indians|pakistanis|asians|chinese|africans|arabs|muslims|jews|hindus|sikhs|immigrants|migrants|refugees|foreigners|asylum seekers|lebanese|sudanese|somalis|afghans|mexicans)";

// Faiths by name, every one the same way. Arguing with what a religion
// teaches is fine; calling it a disease, or calling for it to be banned or
// wiped out, lands on everyone who follows it.
const FAITHS = "(?:islam|christianity|judaism|hinduism|sikhism|buddhism|catholicism|atheism|(?:the\\s+)?(?:muslim|islamic|christian|jewish|hindu|sikh|buddhist|catholic)\\s+(?:faith|religion))";
const FAITH_DISEASE = "(?:cancers?|cancerous|diseased|disease|plague|virus|infection|infestation|tumou?r|poison|parasite|pestilence|blight|scourge|sickness|mental (?:illness|disorder)|contagion|filth|filthy|vermin|cesspool|death cult|cult of death|(?:religion|ideology|cult) of (?:hate|hatred|terror|terrorism|death|violence|war|rape|paedos?|pedos?|paedophiles|pedophiles)|(?:terrorist|paedo|pedo|paedophile|pedophile|rapist) (?:religion|cult|ideology)|satanic|the enemy(?! of)|(?:threat|menace|danger) to (?:australia|society|humanity|civili[sz]ation|the west|western (?:civili[sz]ation|values|society)|our (?:country|way of life|values|kids|children|society)))";
// Keeping a faith out of state schools or the law is a debate, not an attack.
const NOT_SECULAR = "(?!\\s+(?:from|in|out of)\\s+(?:state schools?|public schools?|parliament|government|politics|the law|law|the curriculum))";

// Political identities: only violence and dehumanisation are checked.
const POLITICAL = [
  "leftists?", "lefties", "liberals?", "libs", "conservatives?", "right[- ]?wingers?", "left[- ]?wingers?",
  "republicans?", "democrats?", "labor voters?", "liberal voters?", "greens voters?", "greenies", "communists?",
  "socialists?", "capitalists?", "zionists?", "feminists?", "boomers?", "zoomers?",
];

// The same groups in formal or euphemistic dress, as used to make hate sound
// like analysis ("certain demographics", "people of African descent").
const DRESSED_UP = [
  "(?:certain|some|these|those|such|particular) (?:demographics?|populations?|ethnicit(?:y|ies)|races?|cultures?|communities|ethnic groups|peoples|backgrounds)",
  "(?:people|persons|individuals|populations?|those|men|women) of (?:african|asian|middle[- ]eastern|arab|arabic|jewish|indian|south asian|aboriginal|islamic|muslim|semitic|colou?r|mixed|non[- ]?white|non[- ]?european|migrant|third[- ]world) (?:descent|origin|heritage|extraction|background|stock|ancestry)",
  "sub[- ]saharan (?:africans?|populations?|peoples?)", "third[- ]world(?:ers| migrants| immigrants| populations?| peoples?)",
  "non[- ]?whites", "non[- ]?europeans", "homosexuals", "transgenders", "transsexuals", "the disabled", "the handicapped",
  "(?:muslim|islamic|african|asian|indian|chinese|arab) (?:migrants|immigrants|populations?|communities|men|youths?)",
  "(?:the )?(?:black|african|asian|indian|muslim|arab|aboriginal|jewish|white|chinese) (?:race|population|diaspora|community)",
  "semites", "jewry", "the jews", "the blacks", "the muslims", "the gays", "the trans community", "the lgbt community",
];

const alt = (list) => `(?:${list.join("|")})`;
const PEOPLE_RE = alt(PEOPLE);
const DRESSED_RE = alt([...DRESSED_UP, ...PEOPLE]);
const ANY_GROUP_RE = alt([...DRESSED_UP, ...PEOPLE, ...POLITICAL]);

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
  "groomers", "predators", "degenerates?", "abominations?", "freaks", "mentally (?:ill|sick|deranged|disordered)",
  "(?:sexual )?deviants?", "perverts?", "parasites", "leeches", "a parasite", "a blight", "a scourge",
  "sick in the head", "(?:a )?mental (?:illness|disorder)",
  "property", "(?:sex |mere )?objects", "whores", "sluts", "hoes", "breeding (?:stock|machines?)",
  "baby (?:machines?|factories)", "incubators", "holes",
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
const EXCLUDE = "(?:deport|expel|kick out|throw out|send back|ban|repatriate|remigrate)";
const OUTCOME = "(?:die|be killed|be gassed|be shot|be exterminated|be wiped out|be put down|be rounded up|be locked up|burn|hang|be hanged|be hung|be lynched|not exist|be sterili[sz]ed|be deported|be kicked out|go back|get out|leave (?:the country|australia|our country))";
// "I'll", "we're gonna", "I want to"...
const WILL = "(?:i|we)\\s*(?:'?ll|will|'?m going to|am going to|'?m gonna|am gonna|m gonna|gonna|'?re going to|are going to|'?re gonna|want to|wanna)";
const HURT = "(?:kill|hurt|stab|shoot|murder|rape|strangle|choke|slit)";
// "Beat" only with a violent ending: "I'll beat you at chess" is fine.
const RAPE = "(?:gang ?)?(?:rape|raped|raping|molest|molested|sexually assault(?:ed)?)";
const WOULD_RAPE = "(?:i'?d|i would|i will|i'?ll|i'?m (?:gonna|going to)|im (?:gonna|going to)|imma|ima|we'?ll|we will|we'?d|someone (?:should|needs to|oughta|ought to|has to|gotta|is gonna)|somebody (?:should|needs to|ought to|is gonna)|hope (?:she|he|you|u|they) (?:gets?|get))";
const NOT_NEGATED = "(?!(?:never|not|ever|n'?t)(?![a-z]))";
const BEAT_UP = "(?:beat|bash|smash)\\s+(?:you|u|ya)\\s+(?:up|to death|senseless|to a pulp)";

const re = (src) => new RegExp(src, "i");

// For the dressed-up patterns: "inherently", "genetically"...
const INNATE = "(?:inherently|innately|naturally|genetically|biologically|intrinsically|fundamentally|essentially|by nature|congenitally|racially|evolutionarily|culturally|statistically|demonstrably|objectively|scientifically)";
// ...and the claims made with them.
const LACKING = [
  "inferior", "subhuman", "primitive", "backward", "savage", "uncivili[sz]ed", "degenerate", "unintelligent",
  "less (?:intelligent|evolved|civili[sz]ed|capable|human|rational)", "lower[- ](?:iq|intelligence)",
  "of (?:lower|lesser) (?:intelligence|iq|worth|value|stock)", "unfit (?:for|to) (?:society|civili[sz]ation|citizenship|leadership|parenthood|govern)",
  "(?:pre)?disposed (?:to|towards) (?:crime|criminality|violence|deviance|dishonesty|laziness|terrorism|rape|theft)",
  "prone to (?:crime|criminality|violence|deviance|rape|terrorism|theft|dishonesty)",
  "violent", "criminals?", "criminal by nature", "dishonest", "lazy", "untrustworthy", "unassimilable",
  "more (?:violent|criminal|dangerous|dishonest|primitive|backward|aggressive|savage|barbaric|corrupt|stupid)",
  "incompatible with (?:civili[sz]ation|western (?:society|civili[sz]ation|values)|democracy|our (?:society|values|way of life)|australian (?:society|values))",
].join("|");

// Coded hate: it doesn't name anyone, or it's a joke everyone's in on.
// Nothing but punctuation, emoji or a throwaway word after it, so "Australia is
// finished if they bat like that" stays a cricket opinion.
const ENDS = "(?=(?:\\s+(?:lol|lmao|lmfao|haha+|mate|boys|lads|fellas|bro|bruh|tho|though|now|anyway|ay|eh|too))*\\s*(?:$|[.!?,…;:\\n)]|[^\\x00-\\x7f]))";
const FOREIGN = "(?:pakistan|india|mumbai|delhi|karachi|dhaka|punjab|bangladesh|afghanistan|kabul|saudi(?: arabia)?|somalia|sudan|lebanon|iraq|iran|syria|nigeria)";
const SEND_BACK = "(?:pakistan|india|china|bangladesh|sri lanka|nepal|afghanistan|iran|iraq|syria|lebanon|somalia|sudan|nigeria|africa|the middle east|saudi(?: arabia)?|vietnam|the philippines|indonesia|mexico|the jungle|the desert)";
const HOME_PLACE = "(?:australia|aus|sydney|melbourne|brisbane|perth|adelaide|logan|ipswich|parramatta|harris park|uq|uni|campus|this suburb|my suburb|this street|my street|this city)";
const UNNAMED = "(?:that|this|those|these|their|his|her|your|a certain|certain)\\s+(?:community|communities|people|lot|bunch|mob|religion|faith|kind|culture)";
const SIGNS = {
  islam: "(?:☪|🕌|🧕)", islamHarm: "(?:💣|💥|🧨|🔫|🔪|🐷|🐖|🐽|🥓)",
  jewish: "(?:✡|🕎)", jewishHarm: "(?:⛽|🚿|🐀|👃|🤑|💰|🪙)",
  india: "🇮🇳", indiaHarm: "(?:💩|🚽|🤮|🐄)",
  pride: "(?:🏳🌈|🏳⚧)", prideHarm: "(?:🤮|🤢|🗑|🚮|🔫|🪓|🚫|🪢|💩|🤡)",
};
const nearEachOther = (a, b, gap = 40) => `(?:${a}[^\\n]{0,${gap}}${b}|${b}[^\\n]{0,${gap}}${a})`;
// Celebrating, not threatening: "Eid Mubarak ☪️💥🎉".
const GREETING_RE = /mubarak|(?<![a-z])eid(?![a-z])|ramadan|ramzan|alhamdulillah|inshallah|mashallah|masha allah|celebrat|congrat/;

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
  // "I hate X" (people, not ideas: "I hate Islam" is borderline, below)
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
  // "X control the media"
  { category: "conspiracy", re: re(`${B}${DET}${PEOPLE_RE}\\s+(?:secretly\\s+|really\\s+|basically\\s+)?(?:control|run|own|rule)s?\\s+(?:the\\s+|our\\s+|all\\s+(?:the\\s+)?)?(?:media|news|banks?|banking|world|government|governments|hollywood|money|finance|economy|everything|the west)${E}`) },
  // "X belong in cages", "X should be in camps"
  { category: "dehumanising", re: re(`${B}${PEOPLE_RE}\\s+(?:belong|should be|need to be|ought to be|deserve to be)\\s+(?:locked up\\s+)?in\\s+(?:the\\s+|a\\s+)?(?:cages?|zoos?|camps?|concentration camps?|gas chambers?|ovens?|chains|the ground|graves?)${E}`) },
  { category: "dehumanising", re: re(`${B}${PEOPLE_RE}\\s+${IS}\\s+(?:invading|infesting)${E}`) },
  // "women shouldn't have rights", "X don't deserve a say"
  { category: "exclusion", re: re(`${B}${DET}${PEOPLE_RE}\\s+(?:shouldn'?t|should not|must not|mustn'?t|don'?t deserve|do not deserve|doesn'?t deserve|dont deserve)\\s+(?:to\\s+)?(?:have|get)\\s+(?:any\\s+|equal\\s+|the same\\s+)?(?:rights|the vote|a vote|a say|an education|jobs|freedom|to vote)${E}`) },
  // "an Indian invasion", "migrant hordes"
  // (Not a cuisine or a music scene: "the Asian invasion of Sydney's food scene".)
  { category: "dehumanising", re: re(`${B}${ORIGIN_ADJ}\\s+(?:invasion|invaders|infestation|horde|hordes|swarm|swarms|plague|takeover)${E}(?!\\s+of\\s+(?:the\\s+)?(?:[a-z']+\\s+){0,2}?(?:food|restaurants?|cuisine|dining|eats|music|fashion|films?|movies?|cinema|anime|k-?pop|scene|menus?)${E})`) },
  // "X shouldn't be allowed to vote"
  { category: "exclusion", re: re(`${B}${PEOPLE_RE}\\s+(?:shouldn'?t|should not|must not|mustn'?t)\\s+(?:be allowed to|get to|have the right to)\\s+(?:vote|work|drive|exist|live here|marry|have rights|have kids|breed|own (?:property|homes?))${E}`) },
  // "Islam is a cancer", "Christianity is a mental illness", "ban Judaism",
  // "Hinduism has no place in Australia"
  { category: "religion", kind: "faith", re: re(`${B}${FAITHS}(?:\\s+${IS}\\s+${FILLER}(?:a |an |the )?|'s\\s+${FILLER}(?:a |an |the ))${FAITH_DISEASE}${E}`) },
  { category: "religion", kind: "faith", re: re(`${B}${FAITHS}\\s+(?:is\\s+)?(?:spreading|spreads|spread|growing|grows)\\s+like\\s+(?:a\\s+)?(?:cancer|disease|plague|virus|infection|tumou?r|rats|cockroaches|vermin)${E}`) },
  { category: "religion", kind: "faith", re: re(`${B}(?:ban|outlaw|eradicate|exterminate|wipe out|destroy|kill|nuke|purge|erase|get rid of|eliminate|stamp out|rid (?:australia|the world|the west|our country|this country) of)\\s+(?:all\\s+)?${FAITHS}${E}${NOT_SECULAR}`) },
  { category: "religion", kind: "faith", re: re(`${B}${FAITHS}\\s+(?:should|must|needs? to|has to|ought to|deserves? to)\\s+(?:all\\s+)?(?:be\\s+)?(?:banned|outlawed|eradicated|exterminated|wiped out|destroyed|erased|eliminated|stamped out|purged|nuked|wiped off the (?:map|earth|face of the earth)|die|burn)${E}${NOT_SECULAR}`) },
  { category: "religion", kind: "faith", re: re(`${B}${FAITHS}\\s+(?:has|have)\\s+no\\s+place\\s+(?:here|in\\s+(?:australia|this country|our country|the west|society|our society|modern society|a (?:modern|civili[sz]ed) society))${E}`) },
  { category: "religion", kind: "faith", re: re(`${B}${FAITHS}\\s+(?:doesn'?t|does not|dont|don'?t)\\s+belong(?:\\s+(?:here|in\\s+(?:australia|this country|our country|the west|society)))?${E}`) },
  // "go back to Pakistan" (but not "I go back to India next month")
  { category: "xenophobia", re: re(`(?:^|[.!?\\n]\\s*|${B}(?:should|just|can|must|needs? to|need to|better|then|please|ought to|gotta|could)\\s+)(?:go|get|run|head|move)\\s+back\\s+to\\s+${SEND_BACK}${E}${ENDS}`) },
  { category: "xenophobia", re: re(`${B}(?:fuck|f\\*+k|piss|p\\*+ss|sod|bugger|rack)\\s+off\\s+(?:back\\s+)?(?:to\\s+)?(?:${SEND_BACK}|where (?:you|u|they|he|she) (?:came|come) from|(?:your|ur|their|his|her) (?:own\\s+)?country)${E}`) },
  { category: "xenophobia", re: re(`${B}go\\s+back\\s+to\\s+(?:shitting|shit\\s+(?:in|on)|pooing|defecating)${E}`) },
  { category: "xenophobia", re: re(`${B}go\\s+play\\s+for\\s+${SEND_BACK}${E}`) },
  // "is this Brisbane or Mumbai", "Sydney is turning into Pakistan"
  { category: "xenophobia", kind: "coded", re: re(`${B}(?:is this|are we in|thought this was|this is|is that)\\s+${HOME_PLACE}\\s+or\\s+(?:${FOREIGN}|china|beijing)${E}`) },
  { category: "xenophobia", kind: "coded", re: re(`${B}${HOME_PLACE}\\s+(?:is\\s+|are\\s+|has\\s+|have\\s+)?(?:(?:already|basically|slowly|just)\\s+)?(?:turning into|becoming|become|turned into)\\s+(?:little\\s+|mini\\s+|the new\\s+|another\\s+)?${FOREIGN}${E}`) },
  { category: "xenophobia", kind: "coded", re: re(`${B}(?:cant|can'?t|cannot)\\s+(?:go|walk|drive)\\s+anywhere\\s+without\\s+(?:seeing|hearing|smelling|running into)\\s+(?:an?\\s+)?${PEOPLE_RE}${E}`) },
  // "X ruin everything", "every terrorist is X", "X get everything for free"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${PEOPLE_RE}\\s+(?:ruin|ruined|ruins|wreck|wrecked|wrecks|destroy|destroyed|destroys|trash|trashed|trashes|poison|poisoned|poisons)\\s+(?:every ?thing|every (?:country|place|suburb|city|uni|street)|this (?:country|suburb|place|city|street|uni)|our (?:country|suburbs?|cities|city|culture|schools|unis?)|australia|the (?:country|suburb|neighbou?rhood|city|west))${E}`) },
  { category: "dehumanising", kind: "stereotype", re: re(`${B}(?:all|every|every single|most)\\s+(?:terrorists?|rapists?|paedos?|pedos?|paedophiles?|pedophiles?|scammers?|criminals?)\\s+(?:is|are)\\s+(?:a\\s+|an\\s+)?${PEOPLE_RE}${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}${PEOPLE_RE}\\s+get\\s+(?:everything for free|everything free|free (?:houses?|cars?|money)|all the (?:handouts|money))${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}${PEOPLE_RE}\\s+(?:never|didn'?t(?: even)?|did not(?: even)?|couldn'?t(?: even)?)\\s+(?:invent(?:ed)?|have|had|make|made)\\s+(?:the\\s+)?wheel${E}`) },
  // "only in the team because he's Muslim", "she only got the job because she's a woman"
  { category: "stereotype", kind: "stereotype", re: re(`${B}only\\s+(?:got|in|there|picked|selected|chosen|hired|on|made)\\b[^.!?\\n]{0,40}\\b(?:because|cause|cos|coz|since)\\s+(?:she'?s|he'?s|they'?re|of (?:her|his|their))\\s+(?:a\\s+|an\\s+)?(?:woman|female|girl|black|gay|muslim|brown|asian|indian|aboriginal|trans|disabled|jewish|hindu|sikh|race|gender|religion|skin|colou?r|sexuality)${E}`) },
  { category: "conspiracy", re: re(`${B}(?:the\\s+)?(?:zionists?|rothschilds?)\\s+(?:secretly\\s+|really\\s+|basically\\s+)?(?:control|run|own|rule)s?\\s+(?:the\\s+|our\\s+|all\\s+(?:the\\s+)?)?(?:media|news|banks?|banking|world|governments?|hollywood|money|finance|economy|everything|the west)${E}`) },
  // "this place used to be white", "fix your own country"
  { category: "xenophobia", kind: "coded", re: re(`${B}(?:used to be (?:so\\s+|all\\s+|mostly\\s+)?white|(?:a\\s+)?white (?:man'?s|men'?s|people'?s|persons?'?) (?:game|sport|country|land|suburb|town)|(?:go back and\\s+)?fix (?:your|ur|their|his|her) own country)${E}`) },
  // The running jokes and slogans.
  { category: "coded", kind: "coded", re: re(`${B}(?:religion of pieces|dindu(?: nuf+in)?|ooga booga|chimp(?:ed|ing|s)?\\s+out|(?:six|6) gorillion|khazarian mafia|synagogue of satan|me love you long time|sit[- ]down money|we grew here,?\\s+you flew here|fuck off,?\\s+we'?re full|(?:not\\s+)?adam and steve|creeping sharia|islami[sz]ation of (?:australia|the west|europe|britain|the uk|sweden|our country)|islamification|repeal the 19th|cow (?:piss|worship\\w*)|bat soup|ok(?:ay)? groomer|(?:your|their|the|ur) prophet (?:was|is) (?:a\\s+)?(?:pedo|paedo|pedophile|paedophile|child ?molester|child ?rapist))${E}`) },
  { category: "coded", kind: "coded", re: re(`${B}(?:sharia(?: law)?\\s+(?:next|soon|incoming|is coming|coming)|next\\s+(?:it'?ll be|it will be|will be|they'?ll (?:want|ask for|demand)|up is|thing you know)\\s+sharia)${E}`) },
  { category: "coded", kind: "term", re: re(`${B}(?:the\\s+)?stolen generations?\\s+(?:never happened|didn'?t happen|did not happen|(?:is|was|were)\\s+(?:a\\s+)?(?:myth|lie|hoax|fake|made up|exaggerated|overblown))${E}`) },
  // "religion of peace" said with a smirk (not when someone means it).
  { category: "coded", kind: "coded", re: re(`${B}so[- ]called\\s+(?:religion of peace|peaceful (?:religion|people|community))${E}`) },
  { category: "coded", kind: "coded", re: re(`${B}(?:religion of peace|peaceful (?:religion|people|community|folks|lot|bunch))[^.!?\\n]{0,30}(?:💣|💥|🧨|😂|🤣|💀|(?<![a-z])(?:lol|lmao|lmfao|haha+|yeah right|my ass)(?![a-z]))`) },
  { category: "coded", kind: "coded", re: re(`(?:💣|💥|🧨|😂|🤣|💀|(?<![a-z])(?:yeah right|sure)(?![a-z]))[^.!?\\n]{0,30}${B}religion of peace${E}`) },
  // "those people blow themselves up", "that community 💣"
  { category: "coded", kind: "coded", re: re(`${B}${UNNAMED}[^.!?\\n]{0,40}(?:(?<![a-z])(?:blow(?:s|ing)?\\s+(?:themselves|things|stuff|everything|us|you|people|buildings)|behead\\w*|jihad\\w*|suicide (?:bomb\\w*|vests?))(?![a-z])|💣|🧨)`) },
  { category: "coded", kind: "coded", re: re(`${B}${UNNAMED}\\s+(?:are|is|all|just|=|r)\\s+(?:all\\s+|just\\s+)*(?:terrorists?|suicide bombers?|jihadis?)${E}`) },
  // The same thing in emoji: a faith's or a community's symbol beside a bomb, a pig, a rat.
  { category: "coded", kind: "coded", innocent: GREETING_RE, re: re(nearEachOther(SIGNS.islam, SIGNS.islamHarm)) },
  { category: "coded", kind: "coded", re: re(nearEachOther(SIGNS.jewish, SIGNS.jewishHarm)) },
  { category: "coded", kind: "coded", re: re(nearEachOther(SIGNS.india, SIGNS.indiaHarm)) },
  { category: "coded", kind: "coded", re: re(nearEachOther(SIGNS.pride, SIGNS.prideHarm)) },
  // Threats against a person: "I'll find you and hurt you", "I know where you live"
  { category: "threat", kind: "threat", re: re(`${B}${WILL}\\s+(?:find|hunt|track)\\s+(?:you|u|ya)\\s+(?:down\\s+)?(?:and\\s+)?${HURT}${E}`) },
  { category: "threat", kind: "threat", re: re(`${B}${WILL}\\s+(?:${BEAT_UP}|${HURT}\\s+(?:you|u|ya|your (?:family|kids?|mum|mom|wife|husband|sister|brother|dog)))${E}(?!\\s+(?:a|an)\\s+(?:message|msg|text|email|dm|line|pic|photo|note|invite|link))`) },
  { category: "threat", kind: "threat", re: re(`${B}i know where (?:you|u) (?:live|work|go to school)${E}`) },
  // self-harm incitement ("join the 41%" is aimed at trans people)
  { category: "harassment", re: re(`${B}(?:kys|k y s|kill (?:your ?self|urself|yourselves)|neck (?:your ?self|urself)|go die|hope (?:you|u) die|drink bleach)${E}`) },
  { category: "harassment", re: re(`${B}(?:join (?:the )?41\\s*%|be(?:come)? (?:part of )?(?:the )?41\\s*%|41\\s*%\\s*(?:yourself|urself|yourselves|it))`) },
  // Rape threats and blaming the victim. A joke doesn't make them postable.
  { category: "sexual_violence", kind: "sexual_threat", re: re(`${B}${WOULD_RAPE}\\s+(?:${NOT_NEGATED}[a-z']+\\s+){0,2}?${RAPE}${E}`) },
  { category: "sexual_violence", kind: "sexual_threat", re: re(`${B}(?:should|needs? to|deserves? to|ought to|oughta)\\s+(?:get|be)\\s+${RAPE}${E}`) },
  { category: "sexual_violence", kind: "sexual_threat", re: re(`${B}(?:deserved?|deserves|deserving)\\s+(?:to\\s+(?:be|get)\\s+|being\\s+|getting\\s+)?${RAPE}${E}`) },
  { category: "sexual_violence", kind: "sexual_threat", re: re(`${B}(?:asking for it|had it coming)\\s*,?\\s*(?:[a-z']+\\s+){0,4}?(?:dressed|dressing|dress|wearing|skirt|outfit|drunk|short)${E}`) },
  { category: "sexual_violence", kind: "sexual_threat", re: re(`${B}(?:dressed|dressing|wearing)\\s+(?:like\\s+)?(?:that|this|a slut|a whore|slutty|like a slut|like a whore)\\s*,?\\s*(?:[a-z']+\\s+){0,3}?(?:asking for it|had it coming|deserved it|deserves it)${E}`) },
  // Putting down a group for who they are: blanket insults, stereotypes and
  // coded terms ("X are stupid", "X belong in the kitchen", "kung flu").
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${PEOPLE_RE}\\s+${IS}\\s+${FILLER}(?:a |an |the )?${alt(INSULTING)}${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${PEOPLE_RE}\\s+(?:can'?t|cannot|can not)\\s+(?:drive|think|lead|cook|be trusted|do maths?|speak english|parallel park)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}${PEOPLE_RE}\\s+(?:belong|should (?:be|stay)|need to (?:be|stay)|go back)\\s+(?:in|to)\\s+the\\s+kitchen${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:get|go)\\s+back\\s+(?:in|into|to)\\s+the\\s+kitchen${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+${IS}\\s+(?:ruining|destroying|taking over|corrupting|poisoning|grooming)\\s+(?:everything|this country|the country|our country|australia|the world|our jobs|our culture|the west|society|our society|our kids|our children|kids|children|families|the family|western civili[sz]ation|our values|our way of life|our suburbs|our neighbou?rhoods?|our schools)${E}`) },
  // "X are taking our jobs"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+${IS}\\s+(?:taking|stealing|nicking)\\s+(?:all\\s+)?(?:of\\s+)?(?:our|the|aussie|australian)\\s+(?:jobs|houses|homes)${E}`) },
  // "women are only good for sex", "make me a sandwich, woman"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${PEOPLE_RE}\\s+${IS}\\s+(?:only|just|really only)\\s+(?:good|useful|there|made|here)\\s+(?:for\\s+)(?:sex|one thing|cooking|cleaning|breeding|making (?:babies|sandwiches|kids)|the kitchen|serving men|pleasing men|looking at)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:go\\s+)?(?:make|get)\\s+(?:me|us)\\s+a\\s+(?:sandwich|sammich|sammie|sammy)\\s*,?\\s*(?:woman|women|girl|girls|bitch|female|toots|sweetheart)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:woman|women|girl|bitch|female)\\s*,?\\s*(?:go\\s+)?(?:make|get)\\s+(?:me|us)\\s+a\\s+(?:sandwich|sammich|sammie|sammy)${E}`) },
  // "trans women are just men"
  { category: "stereotype", kind: "stereotype", re: re(`${B}trans(?:gender)?\\s*(?:women|woman|girls?|females?)\\s+(?:are|is|r)\\s+(?:just\\s+|only\\s+|really\\s+|actually\\s+|still\\s+|literally\\s+|all\\s+)*(?:(?:biological|bio)\\s+)?(?:men|man|males?|dudes?|blokes?|guys?|boys?)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}trans(?:gender)?\\s*(?:men|man|boys?|males?)\\s+(?:are|is|r)\\s+(?:just\\s+|only\\s+|really\\s+|actually\\s+|still\\s+|literally\\s+|all\\s+)*(?:(?:biological|bio)\\s+)?(?:women|woman|females?|girls?|chicks?)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:i'?m|im|i am)\\s+not\\s+(?:a\\s+)?(?:racist|sexist|homophobic|transphobic|bigot(?:ed)?)\\s*,?\\s+but${E}(?=.*${B}${PEOPLE_RE}${E})`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:kung flu|china virus|wuhan virus|chinese (?:virus|flu)|chink (?:virus|flu))${E}`) },
  { category: "stereotype", kind: "stereotype", re: /\({3}\s*[^()]{1,40}\s*\){3}/ },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:saar|saaar+|sirs? pls|redeem(?:ed)? sir|bloody bastard benchod)${E}`) },
  // The same hate in academic or "just analysis" language. Each needs a group
  // and an absolute claim about it, so policy and research talk stay fine
  // ("migrants can't integrate without English classes", "IQ tests carry
  // cultural bias").
  // "X are inherently inferior", "these populations are predisposed to criminality"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:are|is|remain|tend to be|have proven to be|appear to be|seem to be|have always been)\\s+${FILLER}(?:${INNATE}\\s+)?(?:${LACKING})${E}`) },
  // "X have lower average IQ", "X exhibit diminished impulse control"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:${INNATE}\\s+)?(?:have|has|possess|display|exhibit|show|demonstrate)\\s+(?:an?\\s+)?(?:[a-z]+\\s+){0,2}?(?:lower|reduced|inferior|diminished|limited|deficient)\\s+(?:average\\s+)?(?:iq|intelligence|cognitive (?:ability|abilities|capacity|function)|intellect|mental capacity|moral (?:capacity|development|sense)|impulse control|capacity for (?:reason|empathy|civili[sz]ation))${E}`) },
  // "women lack the capacity for leadership", "X lack the intelligence for"
  { category: "stereotype", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:${INNATE}\\s+)?(?:lack|lacks|are lacking|are devoid of|are without)\\s+(?:the\\s+|any\\s+)?(?:[a-z]+\\s+)?(?:intelligence|intellect|morality|morals|civility|self[- ]control|impulse control|capacity for (?:reason|logic|leadership|empathy|rational thought|abstract thought|civili[sz]ation|self[- ]government)|capacity to (?:reason|lead|think|govern))${E}`) },
  // "X will never assimilate", "X are incapable of integrating"
  { category: "xenophobia", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:will never|can never|could never|are incapable of|are inherently (?:unable|incapable) (?:to|of)|fundamentally cannot|simply cannot|by nature cannot|are unable to ever)\\s+(?:assimilat\\w*|integrat\\w*|be civili[sz]ed|becom\\w* civili[sz]ed|govern themselves|adapt\\w* to (?:our|western|australian) (?:values|society|culture|way of life))${E}`) },
  // "X will never be real Australians", "trans women aren't real women"
  { category: "xenophobia", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:are not|aren'?t|will never be|can never be|could never be|are never)\\s+(?:real|true|proper|genuine|fully|actual)\\s+(?:australians?|aussies?|citizens|members of (?:this|our) (?:society|nation|country)|humans?|people|women|men)${E}`) },
  // "X pose a threat to Western civilisation", "X are a burden on society"
  { category: "dehumanising", kind: "stereotype", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:are|is|represent|pose|constitute|remain)\\s+(?:a\\s+|an\\s+)?(?:[a-z]+\\s+){0,2}?(?:threat|danger|burden|drain|cancer|plague|blight|scourge|menace|parasite|infestation|contagion)\\s+(?:to|on|upon|for)\\s+(?:society|civili[sz]ation|the nation|the country|our (?:country|nation|society|culture|values|way of life|people)|the west|western (?:society|civili[sz]ation|values)|australia|humanity)${E}`) },
  // "X should not be permitted to vote", "X should be barred from public life"
  { category: "exclusion", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:should|must|ought to)\\s+(?:not|never)\\s+be\\s+(?:permitted|allowed|granted|given|entitled)\\s+(?:to\\s+)?(?:vote|citizenship|to immigrate|immigrate|entry|enter|hold office|rights|equal rights|residency|visas?|to marry|marry|adopt|have children|reproduce)${E}`) },
  { category: "exclusion", re: re(`${B}${DET}${DRESSED_RE}\\s+(?:should|must|ought to)\\s+be\\s+(?:barred|excluded|prohibited|banned|removed|expelled|repatriated|segregated|sterili[sz]ed)(?:\\s+(?:from|out of)\\s+[a-z ]{2,40})?${E}`) },
  // Being gay or trans described as an illness or perversion.
  { category: "dehumanising", re: re(`${B}(?:homosexuality|being (?:gay|lesbian|bi|bisexual|queer|trans|transgender)|gayness|same[- ]sex attraction|transgenderism|transsexualism|gender ideology)\\s+${IS}\\s+(?:a\\s+|an\\s+|just\\s+|simply\\s+|clearly\\s+)?(?:[a-z]+\\s+)?(?:mental illness|mental disorder|psychiatric disorder|psychological disorder|pathology|disease|deviance|deviancy|perversion|abomination|sickness|delusion|aberration|degeneracy|unnatural|a sin|sinful|immoral|evil|a choice to be corrected|curable)${E}`) },
  // Sexism in a lab coat: "women are biologically suited only to domestic roles"
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:women|females|girls|wives)\\s+(?:are|is)\\s+(?:[a-z]+\\s+){0,2}?(?:suited|designed|made|meant|built|fit)\\s+(?:only\\s+)?(?:to|for)\\s+(?:domestic\\w*|the home|housework|childbearing|child[- ]?rearing|motherhood|serving men|subservience|submission|the kitchen|obedience)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:women|females|girls)\\s+(?:are|is)\\s+(?:simply\\s+|just\\s+|naturally\\s+|biologically\\s+)?too\\s+(?:emotional|irrational|hysterical|weak|stupid|hormonal|illogical)\\s+(?:to|for)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:a\\s+)?wom[ae]n'?s\\s+(?:proper\\s+|rightful\\s+|natural\\s+)?place\\s+is\\s+in\\s+the\\s+(?:home|kitchen|house)${E}`) },
  { category: "stereotype", kind: "stereotype", re: re(`${B}(?:women|wives|females)\\s+(?:should|must|ought to)\\s+(?:always\\s+)?(?:submit|obey|be subservient|be submissive|defer)\\b(?:\\s+to\\s+(?:men|their husbands|males))?`) },
  // Known code phrases and pseudo-science, whoever they're about.
  { category: "conspiracy", kind: "term", re: re(`${B}(?:the\\s+)?(?:great replacement|white genocide|kalergi plan|jewish question|zionist occupied government|globalist cabal|race realis[mt]|racial hierarchy|human biodiversity|racial purity|race mixing|mud races?|untermensch\\w*|remigration|replacement theory|white replacement)${E}`) },
  { category: "conspiracy", kind: "term", re: re(`${B}(?:13\\s*/\\s*50|13\\s*/\\s*52|despite being 13\\s*%?|13\\s*%\\s*of the population(?:\\s+(?:but|yet|commit))?|the jq|zog)${E}`) },
  // Nazi and white-supremacist slogans, and Holocaust denial.
  { category: "extremism", kind: "term", re: re(`${B}(?:(?:sieg|seig) heil|heil (?:hitler|victory)|hail hitler|hitler (?:was right|did nothing wrong|had (?:a point|the right idea)|should(?:'?ve| have) finished(?: (?:the|his) job)?|didn'?t finish(?: (?:the|his) job)?|was a (?:hero|genius|legend|great man))|finish(?:ing)? (?:what )?hitler started)${E}`) },
  { category: "extremism", kind: "term", re: re(`${B}(?:(?:the\\s+)?holocaust\\s+(?:never happened|didn'?t happen|did not happen|(?:is|was) (?:a |an |just a )?(?:hoax|lie|myth|fake|fabricat\\w*|exaggerat\\w*|staged|overblown|made up|invented))|holo ?hoax|(?:six|6) million (?:lie|myth|hoax))${E}`) },
  { category: "extremism", kind: "term", re: re(`${B}(?:white power(?! rangers?)|white pride world ?wide|wpww|rahowa|racial holy war|blood and soil|(?:the )?goyim know|day of the rope)${E}`) },
  // 1488 and 14/88, but not as a street number, a price or a measure.
  { category: "extremism", kind: "term", re: re(`(?<![0-9$.,#])(?:14\\s*[/|]\\s*88|1488)(?![0-9.,%])(?!\\s*(?:[a-z]+\\s+)?(?:rd|road|st|street|ave|avenue|dr|drive|hwy|highway|blvd|ln|lane|cres|ct|pde|tce|km|kms|kg|cal|calories|steps|words|dollars|bucks|points|pts|days|hours|minutes|mins|weeks|months|years|people|views|likes|followers)${E})`) },
  // Child sexual abuse material: asking for it, offering it, or its code
  // words. Always blocked, and checked in private messages too.
  { category: "child_safety", kind: "csam", re: re(`${B}(?:child|kiddie|kiddy|kid|toddler|infant|baby|preteen|pre-teen|underage|minor)s?\\s*(?:porn\\w*|p0rn\\w*|pr0n|nudes?|naked pics?|sex (?:pics?|vids?|videos?|content)|xxx|erotica)${E}`) },
  { category: "child_safety", kind: "csam", re: re(`${B}(?:jail ?bait|loli(?:con)?s?|shota(?:con)?|pthc|hussyfan|cheese ?pizza|c\\.?p\\.? (?:links?|trade|trading|vids?|videos?|pics?|folder|collection|for sale|mega|drive)|(?:selling|trading|buying|got|have|send|share|dm me for) (?:cp|c\\.p\\.))${E}`) },
  { category: "child_safety", kind: "csam", re: re(`${B}(?:(?:1[0-5]|[5-9])\\s*(?:yo|y\\/o|y\\.o\\.?|yr ?olds?|year ?olds?)|(?:five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[ -]year[ -]olds?)\\s+(?:[a-z]+\\s+){0,2}?(?:nudes?|naked|porn\\w*|sex(?:y|ual)?|horny|xxx|onlyfans|pics? (?:of (?:her|him|them) )?naked)${E}`) },
  { category: "child_safety", kind: "csam", re: re(`${B}(?:nudes?|naked pics?|porn\\w*|sex(?:ual)? (?:pics?|vids?|videos?|content))\\s+(?:of|from|with)\\s+(?:a\\s+)?(?:kids?|children|child|minors?|underage (?:girls?|boys?|kids?)|little (?:girls?|boys?)|(?:1[0-5]|[5-9])\\s*(?:yo|y\\/o|year ?olds?))${E}`) },
  { category: "child_safety", kind: "csam", re: re(`${B}(?:map pride|minor[- ]attracted|pro[- ]?contact|i(?:'m| am) a (?:pedo|paedo|pedophile|paedophile)|pedo (?:links?|groups?|content|chat)|paedo (?:links?|groups?|content|chat))${E}`) },
];

const BORDERLINE_PATTERNS = [
  // unnamed targets: "those people should die", "these people are animals"
  { category: "violence", re: re(`${B}(?:these|those)\\s+(?:people|guys|men|women|ones|freaks|animals|scum)\\s+(?:[a-z']+\\s+){0,4}?(?:should|deserve to|need to|must|ought to)\\s+(?:all\\s+)?(?:die|be killed|be put down|be shot|be hanged|be hung|be gassed|be exterminated|be wiped out|burn)${E}`) },
  { category: "dehumanising", re: re(`${B}(?:these|those)\\s+people\\s+${IS}\\s+${FILLER}(?:a |an |the )?${alt(DEHUMANISING)}${E}`) },
  // "your kind isn't welcome here"
  { category: "exclusion", re: re(`${B}(?:(?:your|ur|their|his|her)\\s+kind\\s+(?:is ?n'?t|is not|are ?n'?t|are not|ain'?t|not)\\s+(?:welcome|wanted|allowed|needed)|(?:(?:we|i)\\s+)?(?:don'?t|do not|dont)\\s+want\\s+(?:your|ur|their|his|her)\\s+kind|no\\s+(?:room|place)\\s+(?:here\\s+)?for\\s+(?:your|ur|their)\\s+kind)${E}`) },
  // "too many Indians here"
  { category: "xenophobia", re: re(`${B}(?:way\\s+)?too many\\s+${XENO_OBJ}\\s+(?:in (?:australia|this country|our country|my (?:suburb|area|street|city|town))|here|around here|everywhere|coming (?:in|here|over))${E}`) },
  // Sexual put-downs aimed at someone: "she's a dumb slut"
  { category: "sexual_harassment", re: re(`${B}(?:you|u|ur|you'?re|youre|she'?s|shes|she is|her|that)\\s+(?:a\\s+|such a\\s+|one\\s+)?(?:[a-z]+\\s+)?(?:slut|whore|skank|thot)s?${E}`) },
  // Not always hate, but the usual way of saying it: "typical Indian", "female logic".
  { category: "stereotype", re: re(`${B}typical\\s+(?!aussies?|australians?)${PEOPLE_RE}(?:\\s+(?:behaviou?r|drivers?|driving|logic|mentality|move|thing|stuff|shit))?${E}${ENDS}`) },
  { category: "stereotype", re: re(`${B}(?:(?:must|musta|probably|clearly|bet)\\s+(?:be\\s+)?(?:on\\s+)?(?:her|their|your|ur)\\s+(?:period|rag)|time of the month)${E}`) },
  { category: "stereotype", re: re(`${B}(?:(?:female|woman|women)(?:'?s)?\\s+logic|(?:woman|women)\\s+moment|(?:women|woman|female|asian|indian|chinese)\\s+drivers?(?:\\s+(?:lol|lmao|haha+))?${ENDS})`) },
  { category: "stereotype", re: re(`${B}(?:alphabet (?:people|mafia|crowd|gang)|(?:there(?:'?s| are| is)?\\s+)?only\\s+(?:2|two)\\s+genders|what is a woman|(?:diversity|dei|quota|token)\\s+(?:hire|pick|selection)|72 virgins)${E}`) },
  { category: "exclusion", re: re(`${B}(?:mass deport\\w*|deport\\s+(?:them|em|'em)\\s+all|send\\s+(?:them|em|'em)\\s+(?:all\\s+)?back${E}${ENDS})`) },
  { category: "xenophobia", re: re(`${B}(?:too many of (?:them|these people|those people)${E}(?:\\s+(?:here|around|now|in \\w+|everywhere))*${ENDS}|imagine if (?:white people|whites|we|a white \\w+)\\s+did)`) },
  { category: "xenophobia", re: re(`${B}try\\s+(?:that|this|doing (?:that|this))\\s+in\\s+(?:saudi(?: arabia)?|pakistan|iran|afghanistan|iraq|qatar|dubai|a muslim country)${E}`) },
  // Hating a faith or calling it evil: "I hate Islam", "fuck Christianity"
  { category: "religion", re: re(`${B}(?:i|we|everyone)\\s+(?:fucking\\s+|really\\s+)?(?:hate|despise|loathe|can'?t stand|cannot stand)\\s+${FAITHS}${E}`) },
  { category: "religion", re: re(`${B}${FAITHS}\\s+${IS}\\s+${FILLER}(?:pure\\s+)?(?:evil|demonic|vile|disgusting|trash|garbage|rubbish)${E}`) },
  { category: "religion", re: re(`${B}(?:fuck|fck|fuk|fk|f\\*+ck)\\s+${FAITHS}${E}`) },
];

// What a post is about. Words that mean nothing alone are hate on a post about
// someone's faith, race, sexuality or gender.
const TOPICS = {
  muslim: `${B}(?:muslims?|islam|islamic|allah|ramadan|ramzan|eid|hijabi?|burqa|niqab|mosques?|halal|quran|koran|imam)${E}|☪|🕌|🧕`,
  jewish: `${B}(?:jews?|jewish|judaism|synagogues?|hanukkah|chanukah|passover|yom kippur|rabbi|kosher)${E}|✡|🕎`,
  south_asian: `${B}(?:indians?(?!\\s+(?:ocean|summer|food|restaurant|takeaway|curry))|pakistanis?|bangladeshis?|sri lankans?|nepalis?|nepalese|punjabis?|sikhs?|hindus?|hinduism|sikhism|gurdwara|diwali|holi|desi|bollywood)${E}`,
  asian: `${B}(?:asians?|chinese(?!\\s+(?:food|takeaway|restaurant))|koreans?|japanese|vietnamese|filipin[oa]s?|thais?|indonesians?|malaysians?|lunar new year)${E}`,
  black: `${B}(?:black (?:man|men|woman|women|people|community|lives|kid|kids|family|player|players|actor|actress|girl|boy|guy|student|students)|blacks|african americans?|blm)${E}`,
  african: `${B}(?:africans?|sudanese|somalis?|nigerians?|ethiopians?)${E}`,
  aboriginal: `${B}(?:aboriginals?|aborigines?|indigenous|first nations|torres strait|naidoc|welcome to country)${E}`,
  arab: `${B}(?:arabs?|lebanese|palestinians?|iraqis?|syrians?|afghans?|iranians?|persians?)${E}`,
  migrant: `${B}(?:migrants?|immigrants?|refugees?|asylum seekers?|multicultural)${E}`,
  christian: `${B}(?:christians?|christianity|catholics?)${E}`,
  gay: `${B}(?:gays?|lesbians?|lgbt\\w*|queer|same[- ]sex|pride (?:march|parade|month|flag|round|jersey)|mardi gras|two dads|two mums)${E}|🏳🌈`,
  trans: `${B}(?:trans(?![- ](?:tasman|siberian|pacific|atlantic|am))|transgender|non[- ]?binary)${E}|🏳⚧`,
  women: `${B}(?:women'?s (?:sport|cricket|footy|football|soccer|afl|nrl|league|team|rights|day)|aflw|nrlw|matildas|feminis[mt]s?|female (?:captain|ceo|pm|prime minister|boss|leader|coach|referee|umpire|driver|pilot)|first (?:woman|female))${E}`,
  disabled: `${B}(?:disabled|disability|autistic|autism|down syndrome|wheelchair|paralympi\\w*)${E}`,
};
const TOPIC_RES = Object.entries(TOPICS).map(([name, source]) => [name, re(source)]);
const remembered = new Map();
export function topicsIn(text) {
  if (!text) return [];
  if (remembered.has(text)) return remembered.get(text);
  const v = normalize(text);
  const found = TOPIC_RES.filter(([, r]) => r.test(v)).map(([name]) => name);
  if (remembered.size > 300) remembered.clear();
  remembered.set(text, found);
  return found;
}

// "Australia is cooked" is fair comment on a loss, a crime or a rent rise.
const CONTEST_RE = re(`${B}(?:vs?|versus|beat|beats|beaten|defeat\\w*|thrash\\w*|wickets?|innings|all out|series|test match|odi|t20|world cup|semi[- ]?finals?|grand finals?|finals?|scoreboard|rankings?)${E}`);
const CRIME_RE = re(`${B}(?:attack\\w*|charged|arrested|jailed|sentenced|assault\\w*|stabb\\w*|shot dead|shooting|murder\\w*|killed|vandal\\w*|graffiti|abus\\w*|threat\\w*|racis[mt]\\w*|bigot\\w*|hate crimes?|islamophob\\w*|antisemit\\w*|anti-semit\\w*|homophob\\w*|transphob\\w*|misogyn\\w*|sexis[mt]\\w*|discriminat\\w*|harass\\w*)${E}`);
const POLICY_RE = re(`${B}(?:rents?|housing|house prices|buyers?|investors?|visas?|immigration|migration|policy|policies|budget|bill|government|minister|labor|liberals?|election|polls?|report finds|survey|data|statistics)${E}`);

const PLACE = "(?:australia|aus|aussie land|straya|the west|the country|this country|our country|england|the uk|britain|america|canada|europe|the world|society|civili[sz]ation|western civili[sz]ation|cricket|the game|the sport|this sport|sport|the team|this team|cricket australia)";
const FALLING = "(?:falling(?: apart)?|fallen|finished|cooked|doomed|dying|dead|done|gone|screwed|stuffed|ruined|rooted|over|going (?:down(?:hill)?|backwards|to (?:shit|hell|the dogs)|under)|in decline|declining|collapsing|on its knees|cucked)";
const REALLY = "(?:so|just|absolutely|fully|truly|officially|already|well and truly|completely|totally|really|literally|bloody|fucking|fkn)";
const THEIR_PLACE = "(?:(?:their|our|this|that|your)\\s+(?:team|side|squad|country|nation|society|club|sport|game|community|culture|dressing room|house|school|uni|neighbou?rhood|suburb|street|city)|society|australia)";
const VILE = "(?:cancer|parasites?|vermin|filth|infestation|terrorists?|jihadis?)";
const NOT_MEDICAL = "(?!\\s+(?:free|survivor|survivors|patient|patients|research|scare|diagnosis|treatment|ward|fund|charity|council|awareness|sign|season|horoscope))";
const FOR_TERROR = ["muslim", "arab"];
const KIND_RE = /(?<![a-z])(?:love\w*|great(?!,? another)|best|amazing|beautiful|gorgeous|legend\w*|proud|welcome|congrat\w*|thank\w*|well done|good|awesome|brilliant|stunning|respect|happy|yum\w*|wholesome|sweet|bless\w*)(?![a-z])|❤|🙌|😍|🥰|🙏|👏|🔥/;

// Only read when the post, the thread or the comment names a group.
//   decline  the "this is why Australia is falling" family (see readPost)
//   coded    blocked; only explicitly calling out the hate clears it
//   soft     resentment that could be fair comment: posted, but folded
//   reaction soft, unless the post is about a crime against them or a contest
const ON_POST = [
  // "This is why Australia is falling", "RIP Australia", "not my Australia"
  { kind: "decline", re: re(`${B}(?:(?:this is|that'?s|thats|see)\\s+)?(?:why\\s+)?${PLACE}(?:'s|\\s+(?:is|are|has|have|was))?(?:\\s+${REALLY})*\\s+${FALLING}${E}${ENDS}`) },
  { kind: "decline", re: re(`${B}(?:rip|r\\.i\\.p\\.?|rest in peace|goodbye|bye bye|so long|farewell|sad day for|sad times for|pray for|what happened to)\\s+${PLACE}${E}${ENDS}`) },
  { kind: "decline", re: re(`${B}what\\s+(?:has|have)\\s+${PLACE}\\s+become${E}`) },
  { kind: "decline", re: re(`${B}not\\s+my\\s+${PLACE}${E}${ENDS}`) },
  // "How do they allow cancer in their team", "he's a cancer"
  { re: re(`${B}${VILE}\\s+(?:in|into|on|to|of)\\s+${THEIR_PLACE}${E}`) },
  { re: re(`${B}(?:he|she|they|you|u|that guy|this guy|that bloke|this bloke|that lot|these people|those people|that community|this community|their lot)\\s*(?:'s|'re|is|are|r|=)?\\s*(?:a\\s+|an\\s+|such a\\s+|just a\\s+|nothing but a\\s+|absolute\\s+|total\\s+|bloody\\s+|fucking\\s+)*(?:cancer|parasites?|vermin|infestation|terrorists?|jihadis?|suicide bombers?|sub-?humans?)${E}${NOT_MEDICAL}`) },
  // "And in return what will that community do", "would they do the same for us"
  { re: re(`${B}in return\\s+what\\s+(?:will|would|do|did|does)\\s+(?:that|this|those|these|their|they|he|she)${E}`) },
  { kind: "soft", re: re(`${B}(?:would|will)\\s+(?:they|he|she|those people|these people|that community)\\s+(?:ever\\s+)?do\\s+the\\s+same${E}`) },
  { kind: "soft", re: re(`${B}they(?:'?d| would)?\\s+never\\s+do\\s+(?:that|this|the same)${E}`) },
  // "send him back", "he's not a real Aussie", "they're taking over"
  { re: re(`${B}(?:(?:send|kick|ship|throw)\\s+(?:him|her|them|em|'em|these people|those people|that lot|the lot of them)(?:\\s+all)?\\s+(?:back|out|home|away)(?:\\s+all)?|deport\\s+(?:him|her|them|em|'em|these people|those people|that lot|the lot of them)(?:\\s+all)?)${E}${ENDS}`) },
  { re: re(`${B}(?:he|she|they|him|her|them)\\s*(?:'s|'re|is|are|r)?\\s*(?:not|isn'?t|aren'?t|ain'?t)\\s+(?:a\\s+|an\\s+)?(?:real\\s+|true\\s+|proper\\s+)?(?:aussies?|australians?)${E}(?![- ]born)`) },
  { re: re(`${B}(?:not one of us|(?:just\\s+)?go (?:back )?home${E}${ENDS})`) },
  { re: re(`${B}(?:they|these people|those people|that lot|them lot)\\s*(?:'re|are|r)?\\s+(?:all\\s+)?(?:everywhere|taking over|ruining|destroying|invading|breeding|multiplying)(?:\\s+(?:${PLACE}|our \\w+|here|everything|this place))?${E}${ENDS}`) },
  // Resentment: "why should the team change", "our country our rules", "woke cricket"
  { kind: "soft", re: re(`${B}(?:bend(?:s|ing)?\\s+(?:over|the knee|backwards)|bow(?:s|ing)?\\s+down|kneel(?:s|ing)?\\s+(?:to|for)|pander(?:s|ing)?|grovel\\w*|cater(?:s|ing)?\\s+(?:to|for)\\s+(?:them|him|her|these|those|one|every|a minority))${E}`) },
  { kind: "soft", re: re(`${B}why\\s+(?:should|do|must|does|would)\\s+(?:we|they|the team|the boys|the rest|everyone|the whole team|aussies|australians)\\s+(?:(?:have|need)\\s+to\\s+)?(?:change|adapt|cater|hide|stop|give up|bend|bow|accommodate|put away)${E}`) },
  { kind: "soft", re: re(`${B}(?:our (?:country|land),?\\s+our rules|when in rome|love it or leave|assimilate or|adapt or (?:leave|go)|if (?:you|they|he|she) (?:don'?t|doesn'?t) like it,?\\s+(?:leave|go home|get out|go back)|respect our (?:culture|traditions?|values|way of life))${E}`) },
  { kind: "soft", re: re(`${B}(?:go woke,?\\s+go broke|(?:so|too|bloody|fucking)\\s+woke|woke\\s+(?:cricket|sport|team|australia|nonsense|garbage|rubbish|bs|bullshit|crap|shit|ca|cricket australia))${E}`) },
  { kind: "soft", re: /🤮|🤢/ },
  // "these people will never integrate", "pray in your own country"
  { re: re(`${B}(?:these people|those people|they|them|he|she)\\s+(?:will never|can never|never|won'?t ever|don'?t|doesn'?t)\\s+(?:integrate|assimilate|fit in|speak english)${E}`) },
  { re: re(`${B}(?:pray|go|stay|do that|do this|live|fight|celebrate)\\s+(?:in|to|back to)\\s+(?:your|ur|their|his|her)\\s+own\\s+country${E}`) },
  { re: re(`${B}(?:(?:we|i)\\s+)?(?:don'?t|do not|dont)\\s+want\\s+(?:your|ur|their|his|her|them|any|more)\\b[^.!?\\n]{0,25}(?<![a-z])here${E}`) },
  { re: re(`${B}(?:when you|if you|you)\\s+let\\s+them\\s+in|letting\\s+them\\s+in${E}`) },
  { re: re(`${B}(?:bulldoze|burn (?:it|them|this) down|torch it|blow it up)${E}`) },
  { re: re(`${B}they(?:'?re| are)?\\s+(?:run|control|own)s?\\s+(?:everything|the world|the media|the banks|hollywood|the country)${E}${ENDS}`) },
  { kind: "soft", re: re(`${B}(?:play(?:s|ing)?\\s+the\\s+victim|(?:race|victim)\\s+card|affirmative action|what about (?:white|the white|us|aussies|australians)|all lives matter|they'?d riot|if (?:we|i|white people|whites) did (?:this|that)|they'?ll ban|ban(?:ning)? (?:beer|alcohol|pork|bacon|christmas|easter)|replac(?:e|ed|ing) us)${E}`) },
  // A short hostile reaction, on a post about someone's identity, is about them
  // however it's worded. Folds only, and not if it's kind or the post is a
  // crime against them ("disgusting" under an attack on a mosque).
  { kind: "reaction", innocent: KIND_RE, re: re(`^\\s*(?:gross|disgusting|vile|pathetic|embarrassing|shameful|shame|yuck|yuk|ew+|no thanks|nah|here we go again|not again|not another|another one|great,? another(?: one)?|enough|stop (?:it|them|this|building \\w+|letting \\w+|bringing \\w+)|ban (?:it|them|this)|shut it down|close it|get rid of (?:it|them)|who asked|who cares|nobody asked|no one asked|nobody cares|no one cares|cringe|what a joke|joke|clowns?|hard pass|keep it to yourselves?)${E}${ENDS}`) },
  { kind: "reaction", re: /^\s*(?:🤡|🙄|🤦|🖕|🚮|💩|\s)+$/ },
  // Aimed at one group, and only ever read on posts about them.
  { topics: FOR_TERROR, re: re(`${B}(?:check|search|watch)\\s+(?:his|her|their|that|the)\\s+(?:bags?|backpacks?|vests?)${E}`) },
  { topics: FOR_TERROR, re: re(`${B}(?:got|has|have|wearing|hiding|strapped(?:\\s+with)?)\\s+(?:a\\s+)?(?:suicide\\s+vest|bomb(?!\\s+of)|explosives?|vest\\s+under)${E}`) },
  { topics: FOR_TERROR, re: re(`${B}(?:he|she|they)\\s*(?:'ll|will|gonna|going to|might|would|'d)\\s+blow\\s+(?:us|you|them|it|everyone|themselves|himself|the \\w+)(?:\\s+up)?${E}`) },
  { topics: FOR_TERROR, kind: "soft", re: /^\s*(?:💣|🧨|\s)+$/ },
  { topics: ["muslim"], re: /🐷|🐖|🐽|🥓/ },
  { topics: ["muslim"], re: re(`${B}(?:(?:give|feed|offer|hand|get)\\s+(?:him|her|them|em)\\s+(?:a\\s+|some\\s+)?(?:bacon|pork|ham)|bring\\s+(?:a\\s+|some\\s+)?(?:bacon|pork|ham)|pray\\w*\\s+to\\s+a\\s+(?:paedo|pedo|paedophile|pedophile)|(?:yell|scream|shout)\\w*\\s+allah\\w*(?:\\s+akbar)?)${E}`) },
  { topics: ["gay", "trans"], re: re(`${B}(?:keep|get)\\s+(?:them|those people|these people|him|her|it)\\s+away\\s+from\\s+(?:the\\s+|our\\s+|my\\s+)?(?:kids|children)${E}`) },
  { topics: ["gay", "trans"], re: re(`${B}(?:groomers?|abominations?|sodom\\w*|gomorrah|degenerates?|mentally ill|mental illness|sick in the head)${E}`) },
  { topics: ["gay", "trans"], kind: "soft", re: re(`${B}(?:adam and eve|praying for (?:your|their|his|her) soul|sinful|poor (?:kids?|child|children)|biological (?:male|man|men|boy)|born (?:a\\s+)?(?:male|man|boy)|delusional|(?:he|him)\\s+should\\s+compete)${E}`) },
  { topics: ["gay", "trans"], kind: "soft", re: re(`${B}(?:not natural|unnatural|against (?:nature|god)|think of the (?:kids|children))${E}`) },
  { topics: ["trans"], re: re(`${B}(?:that'?s|thats|(?:he|it)'?s)\\s+(?:a\\s+|just a\\s+|still a\\s+)?(?:man|dude|bloke|guy|male|woman|girl|female)${E}${ENDS}`) },
  { topics: ["trans"], re: re(`${B}(?:(?:that|this)\\s+thing${E}${ENDS}|what\\s+even\\s+is\\s+(?:that|it)${E})`) },
  { topics: ["black", "african"], re: /🐒|🐵|🦍|🍌|🍉|🍗|🪢/ },
  { topics: ["black", "african"], re: re(`${B}monke?y?s?${E}`) },
  { topics: ["jewish"], re: /🐀|👃|🤑|💰|🪙/ },
  { topics: ["jewish"], re: re(`${B}(?:every (?:single )?time|noticing|early life|shekels?|the nose|guess who|who (?:owns|controls|runs) (?:the|everything))${E}${ENDS}`) },
  { topics: ["jewish"], kind: "soft", re: re(`${B}free palestine${E}`) },
  { topics: ["south_asian"], re: /🐄|💩|🚽/ },
  { topics: ["south_asian", "asian", "african"], re: re(`${B}(?:(?:will|gonna|going to|must|already)\\s+(?:smell|stink|reek)${E}${ENDS}|do\\s+they\\s+(?:even\\s+)?(?:wash|shower|bathe)${E})`) },
  { topics: ["south_asian"], kind: "soft", re: re(`${B}scam\\w*(?:\\s+incoming)?${E}${ENDS}`) },
  { topics: ["asian"], kind: "soft", re: /🦇|🐶|🐕|🐈/ },
  { topics: ["asian"], kind: "soft", re: re(`${B}(?:wuhan${E}${ENDS}|buying (?:up\\s+)?(?:all\\s+)?(?:our|the)\\s+(?:houses|homes|land)|(?:menu|eat\\w*|ate|cook\\w*)[^.!?\\n]{0,15}(?<![a-z])(?:dogs?|cats?|bats?)${E}${ENDS})`) },
  { topics: ["aboriginal"], re: re(`${B}(?:bludg\\w*|dole|walkabout|petrol sniff\\w*|free (?:houses?|cars?|money)|built nothing|welcome to my country)${E}`) },
  { topics: ["migrant"], kind: "soft", re: re(`^\\s*boats${E}${ENDS}`) },
  { topics: ["aboriginal", "migrant"], kind: "soft", re: re(`${B}(?:get over it|(?:my|our) tax(?:es)?|taxpayers?)${E}`) },
  { topics: ["women"], kind: "soft", re: re(`${B}(?:(?:nobody|no one|noone)\\s+(?:watches|cares|asked)|boys under|under[- ]?1[0-9]s?|who let (?:her|them|a woman|a girl|the girls?)\\s+(?:in|out|near|cook)|stick to (?:netball|the kitchen|cooking|cleaning)|(?:she'?ll|she will|she'?s gonna)\\s+(?:be\\s+)?(?:cry\\w*|quit\\w*)|last too)${E}`) },
];

// Preaching in comments: a sermon pasted under a post that has nothing to do
// with it. Any faith, the same way. Faith itself is fine: "Jesus loves you",
// "God bless", "praying for you", a long comment that happens to mention God,
// and anything at all on your own post or one about faith.
const FAITH_POST_RE = re(`${B}(?:god|gods|jesus|christ|christians?|christianity|catholics?|church|bible|gospel|pastor|priest|easter|christmas|scriptures?|sermon|faith|religions?|religious|pray|prayers?|praying|spiritual\\w*|muslims?|islam|islamic|allah|quran|koran|mosques?|ramadan|eid|imam|jews?|jewish|judaism|torah|synagogues?|rabbi|hindus?|hinduism|krishna|temple|gita|diwali|sikhs?|sikhism|gurdwara|buddhis[mt]|buddha|monk)${E}`);
const VERSE_RE = re(`${B}(?:genesis|exodus|psalms?|proverbs|isaiah|jeremiah|matthew|mark|luke|john|acts|romans|(?:[12]\\s+)?corinthians|galatians|ephesians|philippians|hebrews|(?:[12]\\s+)?peter|revelations?|surah(?:\\s+[a-z-]+)?)\\s+\\d+\\s*:\\s*\\d+`);
const PREACH_LINE_RE = re(`${B}(?:(?:jesus|christ|god|the lord|allah)(?:\\s+christ)?\\s+(?:still\\s+|really\\s+|truly\\s+)?(?:loves?\\s+(?:you|u|us|everyone)|saves?|died for|is\\s+(?:the\\s+)?(?:lord|king|way|only way|truth|coming|returning|saviou?r|answer)|is\\s+coming\\s+back|is\\s+calling\\s+you|can\\s+save|wants\\s+you)|repent|accept\\s+(?:jesus|christ|the lord|allah|islam)|give your (?:life|heart) to|turn (?:back )?to (?:jesus|god|christ|the lord|allah)|(?:revert|convert) to (?:islam|christianity)|hare krishna)${E}`);
const PREACH_SIGNS = [
  PREACH_LINE_RE, VERSE_RE,
  re(`${B}(?:saviou?r|salvation|born again|the gospel|eternal life|end times|judg(?:e)?ment day|the rapture|kingdom of (?:god|heaven)|only begotten|the one true (?:god|religion)|burn in hell|go(?:ing)? to hell|lake of fire|sinners?)${E}`),
  re(`${B}(?:(?:the\\s+)?(?:bible|quran|koran|scripture|word of god)\\s+(?:says|teaches|tells us|warns)|read (?:your|the) (?:bible|quran|koran)|dawah|shahada)${E}`),
];
const BULKY_CHARS = 120;
const LONG_CHARS = 160;
function isPreaching(text, about, parent) {
  const v = normalize(text);
  const bulky = v.length >= BULKY_CHARS || String(text).split("\n").filter((l) => l.trim()).length >= 3;
  if (!bulky || FAITH_POST_RE.test(normalize(`${about}\n${parent}`))) return false;
  const signs = PREACH_SIGNS.filter((r) => r.test(v)).length;
  if (signs >= 2) return true;
  // One line of it, drawn out and aimed at the reader.
  return signs === 1 && v.length >= LONG_CHARS && PREACH_LINE_RE.test(v) && (v.match(/(?<![a-z])you(?![a-z])/g) || []).length >= 3;
}

/** The same words pasted over and over in one go, whatever they are: "jesus loves you" 500 times. */
export function repeatsItself(text) {
  const words = normalize(text).match(/[a-z0-9']+/g) || [];
  for (let n = 1; n <= 12; n++) {
    let same = 0;
    for (let i = 0; i + n < words.length; i++) {
      same = words[i] === words[i + n] ? same + 1 : 0;
      const times = Math.floor(same / n) + 1;
      if (same >= n && times >= 4 && words.slice(i - same + 1, i - same + 1 + n).join(" ").length * times >= 45) return true;
    }
  }
  return false;
}

// Mockery: group + stereotype + laughter together (blocked, as putting down a group).
const STEREOTYPE_RE = re(`${B}(?:curry|smell\\w*|stink\\w*|scam\\w*|call ?cent(?:er|re)|tech support|street|toilet|poo|shit\\w*|cows?|cow piss|bats?|dogs?|dog meat|rice|chopsticks|accent|sirs?|needful|bobs|vagene|taco|burrito|cartel|terrorists?|bombs?|camels?|sand|oven|shekels?|nose|welfare|centrelink|dole|petrol|goon|boat people|monkeys?|bananas?|watermelon|fried chicken)${E}`);
const LAUGH_RE = /(😂|🤣|💀|😹|😆|(?<![a-z])(?:lmao+|lmfao+|lol+|rofl|kek|haha+|hehe+|xd)(?![a-z]))/i;
const PEOPLE_ONLY_RE = re(`${B}${PEOPLE_RE}${E}`);

// Context. Each match is read within its sentence:
//   negated     "not all X are terrorists"
//   condemned   "saying X are vermin is racist" (judged on the words around
//               the match, never the match itself)
//   framed      the claim is someone else's: reported, quoted, or condemned
//               before it's stated. Condemnation alone only softens a post.
//   reported    "he called me a paki"
//   in-group    "we Indians are always late lol"
//   endorsed    laughter, "facts", "based": overrides the ones above
//   joking      laughter or a playful condition, for threats only

// Negation only counts immediately before the claim ("not gonna lie, X are
// dirty" isn't negated); framing phrases count anywhere earlier.
const NEGATION_NEAR_RE = re(`${B}(?:not|never|isn'?t|aren'?t|wasn'?t|weren'?t|didn'?t|doesn'?t|don'?t|dont|nobody|no one|noone)\\s+$`);
const NEGATION_FAR_RE = re(`${B}(?:myth that|false that|lie that|stereotype that|untrue that|wrong to (?:say|think|claim)|stop saying|quit saying|don'?t say|dont say|stop calling|don'?t call|nobody should say|racist to say|doesn'?t mean)${E}`);
const CONDEMN_RE = re(`${B}(?:racist|racism|racists|xenophob\\w*|bigot\\w*|hate speech|hateful|slurs?|offensive|unacceptable|not (?:okay|ok|cool|funny|acceptable|on|right)|shameful|ignorant|prejudice\\w*|discriminat\\w*|stereotyp\\w*|hurtful|abus(?:e|ed|ive)|harass\\w*|called (?:it )?out|stand (?:up )?(?:against|to)|so tired of|sick of|fed up|had enough of|why do people|people who say|stop calling|stop saying|don'?t call|wrong to say|reported (?:him|her|them|it)|disgusting|vile|gross|appalling|horrific|horrible|sickening|awful|messed up|report (?:anyone|people|them|him|her|it|this)(?: (?:who|that) (?:says?|said|thinks?|posts?|writes?|calls?))?|anyone who (?:says|said|thinks|posts)|(?:got|gets|get|getting|be|been|was|were) (?:banned|blocked|reported|suspended|kicked off|removed)|need to (?:read|learn|educate themselves|grow up|do better)|educate (?:yourself|yourselves|themselves)|(?:is|are|that'?s|it'?s) (?:just )?(?:wrong|false|untrue|nonsense|bs|bullshit))${E}`);
const REPORT_RE = re(`${B}(?:called (?:me|us|him|her|them|my|our|his|their)|call(?:s|ing)? (?:me|us|him|her|them)|got called|was called|were called|being called|keeps? calling|kept calling|(?:said|says|saying|told (?:me|us|him|her|them)(?: to)?|yelled|shouted|screamed|wrote|commented|messaged|texted|dm'?d|posted|replied)${E}|someone said|heard (?:someone|a guy|a man|a woman|him|her|them)|(?:people|someone|they|he|she|some|many|folks|anyone|those)\\s+(?:who\\s+)?(?:think|thinks|believe|believes|claim|claims|reckon|reckons|insist|insists))`);
const ENDORSE_RE = /(😂|🤣|💀|😹|😆|👌|💯|(?<![a-z])(?:lmao+|lmfao+|lol+|rofl|kek|haha+|facts|based|so true|true tho|it'?s true|the truth|he'?s right|she'?s right|they'?re right|not wrong|agree|exactly|100%|ngl|fr fr|real talk|just saying|just sayin|no offen[cs]e|(?:i'?m )?not (?:being |trying to be )?(?:a )?racist|call me (?:a )?racist)(?![a-z]))/i;
const INGROUP_BEFORE_RE = re(`${B}(?:we|us)\\s+(?:all\\s+)?$`);
const AS_A_RE = re(`${B}as an?\\s+(?:${PEOPLE.map((e) => e.replace(/s\?$/, "")).join("|")})${E}`);
const FRIENDLY_RE = re(`${B}(?:my|ma|mah|wassup|sup|yo)\\s+$`);
const HISTORY_RE = re(`${B}(?:history|historical|historians?|ww2|wwii|world war|nazi germany|the third reich|in the 1930s|in the 1940s|documentar(?:y|ies)|museum|textbook|history (?:unit|class|lesson|exam|assignment)|lesson|lecture|essay|assignment)${E}`);
// ...unless history is called in to back the claim up ("history shows...").
const HISTORY_PROVES_RE = re(`${B}(?:history|historians?|the (?:facts|evidence|data))\\s+(?:shows?|proves?|proved|teaches|taught|tells us|says|confirms?|backs (?:it|this|him) up)${E}`);
// Words aimed at the hate itself, not at whoever the hate is about ("disgusting" could be either).
export const CALLED_OUT_RE = re(`${B}(?:racis[mt]s?|bigot\\w*|xenophob\\w*|islamophob\\w*|antisemit\\w*|anti-semit\\w*|homophob\\w*|transphob\\w*|sexis[mt]s?|misogyn\\w*|hate speech|hating on|the hate|these comments|this comment(?: section)?|the comments|comment section|comments like|people like (?:you|this|that)|(?:the way|how) (?:people|they) (?:talk|treat)|sick of|stop saying|stop calling)${E}`);
const JOKE_RE = /(😂|🤣|💀|😹|😆|😅|😜|(?<![a-z])(?:lmao+|lmfao+|lol+|haha+|hehe+|jk|j\/k|kidding|joking|xd)(?![a-z])|(?<![a-z])if (?:you|u) (?:spoil|tell|forget|eat|touch|drink|finish|take|use|miss|skip|don'?t|ever)|(?<![a-z])(?:at|in) (?:the )?(?:game|games|match|final|grand final|chess|cards|poker|pool|golf|tennis|footy|fifa|cod|mario ?kart|fortnite|smash|monopoly|uno|trivia|quiz)(?![a-z]))/i;

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
  // The matched words never count as their own condemnation ("X are disgusting").
  const rest = window.replace(v.slice(index, index + length), " ");
  const quotesBefore = (before.match(/["“”'‘]/g) || []).length;
  const inQuotes = quotesBefore % 2 === 1;
  const reported = REPORT_RE.test(before) || (inQuotes && REPORT_RE.test(sentence));
  const negatedFar = NEGATION_FAR_RE.test(before);
  return {
    negated: NEGATION_NEAR_RE.test(before.slice(-12)) || negatedFar,
    condemned: CONDEMN_RE.test(rest),
    framed: reported || inQuotes || negatedFar || CONDEMN_RE.test(before),
    reported,
    endorsed: ENDORSE_RE.test(window),
    ingroup: INGROUP_BEFORE_RE.test(before) || AS_A_RE.test(v),
    friendly: FRIENDLY_RE.test(before.slice(-12)),
    joking: JOKE_RE.test(rest),
    historical: HISTORY_RE.test(rest) && !HISTORY_PROVES_RE.test(rest),
    calledOut: CALLED_OUT_RE.test(rest),
  };
}

function judge(kind, c) {
  if (kind === "attack") {
    if (c.negated) return "ok";
    if (c.condemned && !c.endorsed) return c.framed ? "ok" : "borderline";
    if ((c.reported || c.ingroup) && !c.endorsed) return "borderline";
    return "block";
  }
  // A rape threat or victim-blaming: only reporting or calling it out posts it.
  if (kind === "sexual_threat") {
    if (c.negated) return "ok";
    if ((c.reported || c.condemned) && !c.endorsed) return "quoted";
    return "block";
  }
  // Coded hate: only calling out the hate itself, or condemning a claim framed
  // as someone else's, clears it. "This is why X is falling, disgusting" doesn't:
  // "disgusting" might be about the people targeted.
  if (kind === "coded") {
    if (c.negated || c.calledOut || (c.condemned && c.framed && !c.endorsed)) return "ok";
    if (c.reported && !c.endorsed) return "quoted";
    return c.ingroup && !c.endorsed ? "borderline" : "block";
  }
  // Attacking a faith: fine to call out, and reporting it posts behind a warning.
  if (kind === "faith") {
    if (c.negated || (c.condemned && c.framed && !c.endorsed)) return "ok";
    if (c.reported && !c.endorsed) return "quoted";
    return c.ingroup && !c.endorsed ? "borderline" : "block";
  }
  if (kind === "threat") {
    if (c.negated) return "ok";
    if (c.reported || c.condemned) return "quoted";
    return c.joking ? "borderline" : "block";
  }
  if (kind === "slur") {
    if ((c.condemned || c.reported || c.friendly) && !c.endorsed) return "quoted";
    return "block";
  }
  // Putting down a group: fine about your own, or when denied or called out;
  // reporting what someone else said posts behind a note.
  // A code phrase on its own: fine when it's named to deny, report or call it out.
  // Child sexual abuse material: no framing makes it postable.
  if (kind === "csam") return "block";
  if (kind === "term") {
    if (c.negated || c.condemned || c.framed || c.reported) return "ok";
    if (c.historical && !c.endorsed) return "ok";
    return "block";
  }
  if (kind === "stereotype") {
    if (c.negated || c.condemned || c.ingroup) return "ok";
    return c.reported ? "borderline" : "block";
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

// With plurals, including "-ies" for words ending in y ("tranny", "trannies").
const plural = (word, pattern) => (/y$/.test(word) ? `${pattern.replace(/y\+$/, "")}(?:y+s?|ies)` : `${pattern}(?:e?s)?`);
const SLUR_RES = SLURS.map((w) => re(`${B}${plural(w, slurPattern(w))}${E}`));
const CONTEXTUAL_RES = CONTEXTUAL.map(({ term, innocent }) => ({ re: re(`${B}${plural(term, slurPattern(term, { gaps: false }))}${E}`), innocent }));
const g = (r) => new RegExp(r.source, `${r.flags.replace("g", "")}g`);
const RANK = { ok: 0, quoted: 1, borderline: 2, block: 3 };

/**
 * How to read the "decline" family on this post. Only the post's own words
 * decide: a thread that calls out racism mustn't clear what it's calling out.
 */
function declineKind(about, text) {
  const words = normalize(`${about}\n${text}`);
  if (CONTEST_RE.test(words) || CRIME_RE.test(words)) return null;
  return POLICY_RE.test(words) ? "soft" : "coded";
}

/**
 * `about` is the post a comment is on (see postAbout); `thread` is the comments
 * around it. Either can name the group that unnamed words are aimed at.
 * `comment` also checks for repetition and preaching, the latter against the
 * post and `parent` (the comment it answers) only: a sermon mustn't make its
 * own thread about faith.
 * @returns {{ level: "block"|"borderline"|"quoted"|"ok", category?: string, matched?: string }}
 * `matched` is for moderators only; never show it to the author.
 */
export function assessText(text, { about = "", thread = "", parent = "", comment = false } = {}) {
  if (!text || !String(text).trim()) return { level: "ok" };
  let worst = { level: "ok" };
  const topics = new Set([...topicsIn(about), ...topicsIn(thread), ...topicsIn(String(text))]);
  const decline = topics.size ? declineKind(about, text) : null;
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
      scan(p.re, p.kind ?? (p.category === "harassment" ? "harassment" : "attack"), p.category, p.innocent);
      if (worst.level === "block") return worst;
    }
    for (const p of BORDERLINE_PATTERNS) scan(p.re, "soft", p.category);
    if (topics.size) {
      for (const p of ON_POST) {
        if (p.topics && !p.topics.some((t) => topics.has(t))) continue;
        const kind = p.kind === "decline" ? decline : p.kind === "reaction" ? decline && "soft" : p.kind ?? "coded";
        if (kind) scan(p.re, kind, "coded", p.innocent);
        if (worst.level === "block") return worst;
      }
    }
    if (PEOPLE_ONLY_RE.test(v) && STEREOTYPE_RE.test(v) && LAUGH_RE.test(v)) {
      const m = v.match(PEOPLE_ONLY_RE);
      const c = contextOf(v, m.index, m[0].length);
      consider(judge("stereotype", c), "stereotype");
    }
  }
  if (comment && worst.level === "ok") {
    if (repeatsItself(text)) return { level: "block", category: "repeated" };
    if (isPreaching(String(text), about, parent)) return { level: "block", category: "preaching" };
  }
  return worst;
}

/** The post is about a crime against someone, or abuse of them. */
export const aboutCrime = (about) => CRIME_RE.test(normalize(about));

export function isBorderline(text, context) {
  return assessText(text, context).level !== "ok";
}

/** A post's own words, for reading its comments against. Its pictures can't be read. */
export const postAbout = (post) => [post?.title, post?.text, post?.alt, ...(post?.media || []).map((m) => m.alt), ...(post?.topics || [])].filter(Boolean).join("\n");

const REPEATED = "That's the same thing over and over. Once is enough.";

const BLOCK_MESSAGES = {
  slur: "That includes a slur. Mesh blocks slurs against every group, equally. If you're describing something said to you or calling it out, say so and it can post behind a warning.",
  dehumanising: "That describes a whole group of people as less than human. Criticise ideas, governments or behaviour all you like; attacks on people for who they are aren't allowed, whichever group it is.",
  violence: "That calls for harm against a group of people. That's not allowed on Mesh, against anyone.",
  exclusion: "That calls for a whole group of people to be shut out for who they are. Debate policy all you like; targeting a group isn't allowed.",
  hatred: "That expresses hatred for a whole group of people. You can criticise beliefs, governments and ideas; not people for who they are.",
  stereotype: "That puts down a whole group of people for who they are: their race, gender, sexuality, religion, disability or where they're from. Have a go at a person, a company or an idea all you like; not a group for who they are.",
  xenophobia: "That tells someone they don't belong because of where they or their family are from. Everyone belongs here.",
  conspiracy: "That blames a whole group of people for secretly running things, an old conspiracy theory used against many groups. Criticise specific people, companies or governments instead.",
  threat: "That reads as a threat to hurt someone. If it's a joke, make that clear; real threats aren't allowed on Mesh.",
  harassment: "Telling someone to hurt themselves isn't allowed. If you or someone you know is struggling, Lifeline is on 13 11 14.",
  sexual_violence: "That threatens rape, or blames someone for being sexually assaulted. That's never allowed on Mesh. If it's happened to you, 1800RESPECT is on 1800 737 732.",
  sexual_harassment: "That's a sexual put-down aimed at someone. Disagree with them all you like; leave their body and sex life out of it.",
  extremism: "That's a Nazi or white-supremacist slogan, or denies the Holocaust. Mesh doesn't carry them. If you're calling it out or teaching history, say so and it can post.",
  preaching: "That's a lot of preaching for a post that isn't about faith. A quick \"God bless\" is fine, and you can share your faith on your own posts all you like.",
  repeated: REPEATED,
  context: "That reads as aimed at the people this post is about, rather than at what's in it. If you meant something else, say it another way.",
  coded: "That reads as an attack on people for who they are, even without naming them. On this post it's clear who it's about. If you meant something else, say it another way.",
  religion: "That calls a religion a disease or filth, or calls for it to be banned or wiped out. That lands on everyone who follows it, whichever faith it is. Disagree with what a religion teaches all you like.",
  child_safety: "That reads as sexual content involving children. It's never allowed on Mesh. If a child is in danger, call 000, or report it to the ACCCE at accce.gov.au/report.",
};

export function blockMessage(category) {
  return BLOCK_MESSAGES[category] || BLOCK_MESSAGES.dehumanising;
}

/** The published rule each block names. */
export const RULE_NAMES = {
  slur: "Slurs",
  dehumanising: "Dehumanising a group",
  violence: "Calls for violence",
  exclusion: "Shutting a group out",
  hatred: "Hatred of a group",
  stereotype: "Putting down a group",
  xenophobia: "Telling people they don't belong",
  conspiracy: "Conspiracy theories about a group",
  threat: "Threats",
  harassment: "Telling someone to hurt themselves",
  sexual_violence: "Rape threats and victim-blaming",
  sexual_harassment: "Sexual put-downs",
  extremism: "Nazi slogans and Holocaust denial",
  religion: "Attacking a faith",
  coded: "Coded hate",
  context: "Aimed at who a post is about",
  preaching: "Preaching in comments",
  repeated: "Repeating the same thing",
  child_safety: "Child sexual abuse",
};

// Appeals. Each block is remembered by its message so the message can offer
// an appeal for exactly what was blocked (ui/States InlineMessage). Text a
// person overturned on appeal is let through for its author.
const recentBlocks = new Map();
const overturned = new Set();
const appealKey = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

/** What a block message was for: { text, rule, where }, or null. */
export const blockFor = (message) => recentBlocks.get(message) || null;

/** The message for a block decided by the thread reader, with the usual appeal. */
export function blockedByReader(text, category, where = "comment") {
  const error = blockMessage(category);
  recentBlocks.set(error, { text: String(text).trim(), rule: category, where });
  return error;
}

export const wonAppeal = (text) => overturned.has(appealKey(text));

/** Texts this account won on appeal (loaded at sign-in). */
export function allowOverturned(texts) {
  overturned.clear();
  for (const t of texts) overturned.add(appealKey(t));
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
export function checkContent(text, { key = "post", skipCooldown = false, allowQuoted = false, hate = true, about = "", thread = "", parent = "" } = {}) {
  let verdict = hate ? assessText(text, { about, thread, parent, comment: key === "comment" }) : { level: "ok" };
  // Overturned on appeal: it posts. A slur still goes behind a warning (the
  // server only accepts slurs on posts flagged sensitive).
  if ((verdict.level === "block" || verdict.level === "quoted") && overturned.has(appealKey(text))) {
    verdict = verdict.category === "slur" ? { level: "quoted", category: "slur" } : { level: "ok" };
    allowQuoted = true;
  }
  if (verdict.level === "block" || (verdict.level === "quoted" && !allowQuoted)) {
    const error = blockMessage(verdict.category);
    recentBlocks.set(error, { text: String(text).trim(), rule: verdict.category || "dehumanising", where: key });
    return { error, category: verdict.category };
  }
  // Private messages can repeat themselves all they like.
  const spam = looksLikeSpam(text) || (hate && repeatsItself(text) ? REPEATED : null);
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

/**
 * Private messages, checked only on the device: before sending, the rule a
 * message would break if it were posted, or "" (the sender can still send it,
 * between friends); and whether a message request should arrive folded away.
 * Nothing is recorded either way.
 */
export function messageWarning(text) {
  const v = assessText(text);
  return v.level === "block" && v.category !== "child_safety" ? RULE_NAMES[v.category] || RULE_NAMES.dehumanising : "";
}
export const hideInRequest = (text) => !!text && assessText(text).level === "block";

/**
 * The one check private messages get: sexual content involving children.
 * Returns the message to show, or "" if it's fine.
 */
export function childSafetyBlock(text) {
  const v = assessText(text);
  return v.level === "block" && v.category === "child_safety" ? blockMessage("child_safety") : "";
}
