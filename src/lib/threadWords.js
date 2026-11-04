// The words the thread reader (threadContext.js) looks for. Each list is what's
// actually been said about a group for a long time, so a word only counts on a
// post about that group: "wallet" means nothing under a photo of a wallet.

const B = "(?<![a-z])";
const E = "(?![a-z])";
const rx = (list) => new RegExp(`${B}(?:${list.join("|")})${E}`);

const CRIME = ["rob\\w*", "stole", "stolen", "steal\\w*", "thie[fv]\\w*", "wallets?", "purses?", "lock (?:your|the|ur)", "doors?", "cars?", "carjack\\w*", "gangs?", "apex", "crims?", "criminals?", "thugs?", "riots?", "loot\\w*", "jail", "prison", "stabb?\\w*", "knife", "knives"];
const FREELOADING = ["dole", "welfare", "centrelink", "handouts?", "free (?:\\w+)", "my (?:money|tax|taxes)", "our (?:money|tax|taxes|dime)", "tax ?payers?", "who (?:paid|pays)", "paid for", "bludg\\w*", "our dime"];
const TOKEN = ["quotas?", "token", "diversity", "dei", "woke", "affirmative", "picked because", "only (?:because|cause|cos|got)"];
const FOREIGN = ["real aussies?", "real australians?", "where (?:is|are|was|were|'?s) (?:\\w+ )*from", "actually from", "originally from", "really from", "go home", "their (?:own )?country", "own country", "illegals?", "boats?", "boat people", "visas?", "queue ?jump\\w*", "taking (?:our|over)", "took (?:a|our|the) (?:spot|job|place|seat)"];

export const TROPES = {
  muslim: rx([...FOREIGN, ...TOKEN, "terror\\w*", "bombs?", "bomb\\w*", "blow\\w*", "vests?", "jihad\\w*", "sharia", "extremis\\w*", "radicals?", "behead\\w*", "checked", "check (?:him|her|them|his|her|their)", "searched", "rags?", "towels?", "tablecloths?", "curtains?", "bin ?bags?", "letter ?box\\w*", "ninjas?", "beekeepers?", "that thing", "those things", "oppress\\w*", "forced", "submissive", "virgins?", "pork", "bacon", "halal tax", "bend\\w*", "bow\\w*", "change for", "cater\\w*"]),
  jewish: rx([...TOKEN, "money", "wallets?", "funded", "funding", "funds", "paid", "pay", "rich", "banks?", "bankers?", "media", "control\\w*", "puppets?", "lobby\\w*", "greed\\w*", "stingy", "cheap", "catch", "noses?", "shekels?", "palestine", "gaza", "indoctrinat\\w*", "agenda"]),
  south_asian: rx([...FOREIGN, ...TOKEN, "smell\\w*", "stink\\w*", "reek\\w*", "scam\\w*", "call cent\\w*", "tech support", "uber", "taxi", "taxis", "cabbie", "servos?", "7[- ]?eleven", "seven eleven", "fake", "degrees?", "cheat\\w*", "crowd\\w*", "overcrowd\\w*", "swarm\\w*", "everywhere", "noise", "noisy", "foreigners?", "cows?", "caste", "towels?", "turbans?", "rags?", "india now", "indians everywhere"]),
  asian: rx([...FOREIGN, ...TOKEN, "rice", "dogs?", "cats?", "bats?", "real name", "cheat\\w*", "cop(?:y|ied|ies)", "knock ?offs?", "maths?", "eyes", "wong", "chang", "ching", "chong", "houses", "buying (?:up|all)", "virus", "covid", "wuhan", "ccp", "spy", "spies", "can'?t drive", "drivers?"]),
  black: rx([...CRIME, ...TOKEN, ...FREELOADING, "fatherless", "welfare", "ankle", "jungle", "bananas?", "monkeys?", "where'?s (?:her|his|their) (?:dad|father)"]),
  african: rx([...CRIME, ...TOKEN, ...FREELOADING, ...FOREIGN, "fatherless", "jungle", "bananas?", "monkeys?"]),
  aboriginal: rx([...FREELOADING, ...TOKEN, "sober\\w*", "drunks?", "grog", "goon", "petrol", "sniff\\w*", "contribut\\w*", "built nothing", "invent\\w*", "special", "treated the same", "same rules", "get over it", "move on", "200 years", "australia day", "real work", "have to work", "get a job", "walkabout"]),
  arab: rx([...FOREIGN, ...TOKEN, ...FREELOADING, "terror\\w*", "bombs?", "bomb\\w*", "blow\\w*", "vests?", "jihad\\w*", "extremis\\w*", "rags?", "towels?", "camels?", "sand", "desert", "gangs?", "checked"]),
  migrant: rx([...FOREIGN, ...FREELOADING, ...TOKEN, "jobs?", "spots?", "stayed", "stay and fight", "fought", "invad\\w*", "assimilat\\w*", "integrat\\w*"]),
  christian: rx(["sky daddy", "fairy ?tales?", "bible bash\\w*", "brainwash\\w*", "cult", "kiddy fiddl\\w*"]),
  gay: rx(["fix (?:them|him|her|you)", "right (?:bloke|man|guy|woman|girl)", "real (?:man|men|woman)", "phase", "shov\\w*", "throats?", "flaunt\\w*", "tell everyone", "agenda", "choice", "kids", "children", "groom\\w*", "shower\\w*", "bedroom", "behind closed doors", "sleep with", "who you sleep", "sinners?", "hell", "aids", "hiv", "which one'?s the (?:man|woman|wife|husband)", "wears? the pants", "a mum and a dad", "mum and dad", "boycott\\w*", "pray for"]),
  trans: rx(["biolog\\w*", "chromosomes?", "genders?", "pick a lane", "toasters?", "helicopters?", "pronouns?", "identif(?:y|ies)", "mental\\w*", "delusion\\w*", "confused", "wigs?", "dude", "bloke", "real (?:woman|women|man|men)", "mr", "mrs", "sir", "he", "him", "his", "bathrooms?", "toilets?", "change ?rooms?", "kids", "children", "groom\\w*", "freaks?", "experiment\\w*", "think about the"]),
  women: rx([...TOKEN, "netball", "kitchen", "sandwich\\w*", "dishes", "boys", "men'?s", "under[- ]?\\d+s?", "weak\\w*", "cry\\w*", "hormon\\w*", "periods?", "emotional", "can'?t (?:kick|play|coach|catch|throw|run|tackle|drive|lead|ref)", "what next", "free tickets?", "hysteric\\w*"]),
  disabled: rx(["short bus", "special", "trophy", "participation", "clap for anything", "pity", "window", "helmets?", "drool\\w*", "vegetables?", "burden", "taxpayers?", "ndis rort\\w*"]),
};

// Hinting rather than saying: "bet he...", "of course", "what's next".
export const HINTS = /^(?:i |i'?d |yeah |so |and |but |well |oh |ah )?(?:bet|of course|typical|imagine|what'?s next|whats next|what next|must be nice|surprise surprise|shocker|funny how|notice how|wonder|nice|cool|sure|yeah right|another|here we go|guess|wait (?:till|until)|give it|just wait|hope|at least|nothing like|more |did (?:she|he|they|anyone)|how many|why did|why do|why does|why are|who (?:paid|funded)|the \w+ (?:guy|bloke|one))(?![a-z])|(?<![a-z])(?:i bet|i assume|i guess|probably|only because|only cause|would you trust|what a surprise|who would'?ve thought|funny that)(?![a-z])/;

// Doubting the person, whatever the subject: "hope she's actually qualified",
// "they only hired her", "not exactly Australia". This is the grammar of the
// put-down, so it carries over to wordings nobody's written down.
export const DOUBT = /(?<![a-z])(?:actually|even|probably|no doubt|anyway|not exactly|basically|just a|only|supposedly|allegedly|apparently|so[- ]called|hope (?:she|he|they)|maybe (?:she|he|they)|bet (?:she|he|they)|can'?t (?:understand|even)|couldn'?t|wouldn'?t|doesn'?t|don'?t|not even|simple as)(?![a-z])/;

// The person the post is about.
export const ABOUT_THEM = /(?<![a-z])(?:he|she|him|her|they|them|his|hers)(?:'s|'d|'ll|'re)?(?![a-z])/;

// Setting what's normal against them: "normal meat", "an Australian", "how we do things".
export const NORM = /(?<![a-z])(?:normal|proper|regular|aussies?|australians?|australia|white|the way we|how we do|learn (?:how|to|english|our))(?![a-z])/;

// Us and them.
export const OTHERING = /(?<![a-z])(?:them|they|their|theirs|these people|those people|you people|your people|his people|her people|that lot|them lot|you lot|his kind|her kind|their kind|your kind|that community|foreigners?|outsiders?|real aussies?|real australians?|an? aussie|our (?:country|kids|jobs|tax|taxes|money|dime|culture|land|streets|suburb|schools?|unis?)|everyone has to|for one (?:guy|bloke|person|player|kid))(?![a-z])/;

// Saying they shouldn't be here at all, in any words.
export const SHUT_OUT = /(?<![a-z])(?:not in my|won'?t be (?:eating|going|buying|shopping|coming|watching) (?:there|here|again|anymore)|keep it (?:in|to|behind)|pull (?:their|your|my|our) kids|don'?t belong|shouldn'?t be (?:here|allowed|there|in)|why does everything have to|why do (?:they|we|you) have to|why are they special|why should (?:we|they|everyone)|everyone has to change|back to the (?:netball|kitchen)|what a joke of a country|take (?:that|it) off|is lost|was nice once|used to be|where did all the)(?![a-z])/;

export const HOSTILE = /(?<![a-z])(?:hate|stupid|idiots?|pathetic|disgust\w*|gross|vile|filth\w*|trash|garbage|rubbish|useless|lazy|dirty|shit\w*|crap|jokes?|clowns?|sick of|tired of|fed up|enough|ruin\w*|destroy\w*|fake|liars?|waste|worst|terrible|awful|horrible|ugly|embarrass\w*|shame\w*|nonsense|bullshit|bs|cringe|cruel|barbaric|backwards?|primitive|pander\w*|bending|unfair|can'?t (?:even|get)|cooked)(?![a-z])/;

// Warmth, in the way people here actually say it. Clears everything else.
export const WARM = /(?<![a-z])(?:love\w*|great(?!,? another)|best|amazing|beautiful|gorgeous|legends?|legendary|proud|welcome|congrat\w*|thank\w*|well done|well deserved|good|awesome|brilliant|stunning|respect|happy|yum\w*|wholesome|sweet|bless\w*|unreal|insane|ripper|stoked|rapt|champions?|champs?|hero\w*|inspir\w*|kindest|finest|keen|gem|get around|go (?:her|him|them|on)|good on|so glad|can'?t wait|must try|see you there|we'?ll be there|in spirit|count me in|class act|real deal|top bloke|massive|smart|jackpot|what a (?:kid|legend|win|game|team|captain|moment|player|story)|well played)(?![a-z])|❤|🙌|😍|🥰|🙏|👏|🔥|💪/;

// A real question about the thing itself.
export const ASKS = /^(?:what time|when|where(?:'s| is| do| can)|which|how (?:much is|do|can|long)|is (?:it|there|this)|do (?:they|you) (?:do|take|have|open|sell)|does|can (?:i|anyone|we|you)|who'?s|are (?:they|there)|what'?s the|what was|what is|any )(?![a-z])/;

// Telling someone off: evidence about the comment it answers.
export const REBUKE = /(?<![a-z])(?:that'?s (?:not|so|really|pretty|just) (?:ok|okay|on|cool|low|bad|gross|vile)|what'?s wrong with you|how is this (?:ok|okay|allowed)|delete (?:this|that)|why would you say|shame on you|grow up|do better|reported|you'?re (?:sick|disgusting|vile|pathetic|the problem)|get a life|did you really just|imagine saying|why are you like this|wtf)(?![a-z])/;

// Going along with it.
export const AGREES = /^(?:facts?|exactly|this|so true|true|true that|100%|agree|agreed|yep|yup|based|real|fr|fr fr|preach|say it|well said|spot on|finally someone|someone had to say it|nailed it|(?:he|she|you|they)'?re? right|not wrong|💯|🎯|👏|😂|🤣|😆|lol|lmao|haha+|ha)(?:[\s!.,]*(?:facts?|mate|bro|lol|lmao|haha+|💯|🎯|👏|😂|🤣|😆))*[\s!.,]*$/;

export const STOP = new Set(("a an and are as at be been but by can could did do does for from get got had has have he her hers him his how i if in into is it its just like me more most my no not now of off on one or our out over she so some than that the their them then there these they this those to too up us very was we were what when where which who why will with would you your about after again all also am any because before being both each few here only other own same should such through under until while yes yeah really still even much many im ive dont cant wont youre theyre thats hope bet actually probably maybe anyway though time").split(" "));
