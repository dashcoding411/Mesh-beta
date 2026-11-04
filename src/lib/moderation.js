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
  { term: "cracker", innocent: /\b(barrel|cream|fire|nut|safe|code|jack|graham|water|cheese|christmas|rice|prawn|animal|soda|salt|holiday)\s?crackers?\b|\bcrackers? (barrel|jack|and|with)\b/ },
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
  "baby (?:machines?|factories)", "incubators",
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
  // Hating a faith or calling it evil: "I hate Islam", "fuck Christianity"
  { category: "religion", re: re(`${B}(?:i|we|everyone)\\s+(?:fucking\\s+|really\\s+)?(?:hate|despise|loathe|can'?t stand|cannot stand)\\s+${FAITHS}${E}`) },
  { category: "religion", re: re(`${B}${FAITHS}\\s+${IS}\\s+${FILLER}(?:pure\\s+)?(?:evil|demonic|vile|disgusting|trash|garbage|rubbish)${E}`) },
  { category: "religion", re: re(`${B}(?:fuck|fck|fuk|fk|f\\*+ck)\\s+${FAITHS}${E}`) },
];

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
      scan(p.re, p.kind ?? (p.category === "harassment" ? "harassment" : "attack"), p.category);
      if (worst.level === "block") return worst;
    }
    for (const p of BORDERLINE_PATTERNS) scan(p.re, "soft", p.category);
    if (PEOPLE_ONLY_RE.test(v) && STEREOTYPE_RE.test(v) && LAUGH_RE.test(v)) {
      const m = v.match(PEOPLE_ONLY_RE);
      const c = contextOf(v, m.index, m[0].length);
      consider(judge("stereotype", c), "stereotype");
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
  stereotype: "That puts down a whole group of people for who they are: their race, gender, sexuality, religion, disability or where they're from. Have a go at a person, a company or an idea all you like; not a group for who they are.",
  xenophobia: "That tells someone they don't belong because of where they or their family are from. Everyone belongs here.",
  conspiracy: "That blames a whole group of people for secretly running things, an old conspiracy theory used against many groups. Criticise specific people, companies or governments instead.",
  threat: "That reads as a threat to hurt someone. If it's a joke, make that clear; real threats aren't allowed on Mesh.",
  harassment: "Telling someone to hurt themselves isn't allowed. If you or someone you know is struggling, Lifeline is on 13 11 14.",
  sexual_violence: "That threatens rape, or blames someone for being sexually assaulted. That's never allowed on Mesh. If it's happened to you, 1800RESPECT is on 1800 737 732.",
  sexual_harassment: "That's a sexual put-down aimed at someone. Disagree with them all you like; leave their body and sex life out of it.",
  extremism: "That's a Nazi or white-supremacist slogan, or denies the Holocaust. Mesh doesn't carry them. If you're calling it out or teaching history, say so and it can post.",
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
export function checkContent(text, { key = "post", skipCooldown = false, allowQuoted = false, hate = true } = {}) {
  let verdict = hate ? assessText(text) : { level: "ok" };
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
