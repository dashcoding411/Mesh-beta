import {
  Music, Trophy, Dumbbell, Gamepad2, Palette, Film, BookOpen, Cpu, FlaskConical, UtensilsCrossed, Plane, Shirt,
  HeartPulse, Leaf, PawPrint, Camera, Laugh, GraduationCap, Briefcase, Car, Mic, Sprout, MapPin, Globe2, Landmark,
} from "lucide-react";

/* One list of interests for the whole app: what you pick, what posts and
   circles are tagged with, and what the feed chips filter by.

   Deliberately left out: religion, politics, health conditions, sexuality.
   Those are sensitive information under the Privacy Act, and a list of
   personal interests shouldn't quietly become a record of them. News has
   its own topic list below, which does include politics, because that's a
   subject of reporting rather than a fact about you.

   The ids are also listed in firestore.rules. Change them together. */
export const INTERESTS = [
  { id: "music", label: "Music", icon: Music },
  { id: "sport", label: "Sport", icon: Trophy },
  { id: "fitness", label: "Fitness", icon: Dumbbell },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "art", label: "Art & design", icon: Palette },
  { id: "film", label: "Film & TV", icon: Film },
  { id: "books", label: "Books", icon: BookOpen },
  { id: "tech", label: "Tech", icon: Cpu },
  { id: "science", label: "Science", icon: FlaskConical },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "travel", label: "Travel", icon: Plane },
  { id: "fashion", label: "Fashion", icon: Shirt },
  { id: "wellbeing", label: "Wellbeing", icon: HeartPulse },
  { id: "nature", label: "Nature", icon: Leaf },
  { id: "animals", label: "Animals", icon: PawPrint },
  { id: "photography", label: "Photography", icon: Camera },
  { id: "comedy", label: "Comedy", icon: Laugh },
  { id: "learning", label: "Learning", icon: GraduationCap },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "cars", label: "Cars", icon: Car },
  { id: "podcasts", label: "Podcasts & radio", icon: Mic },
  { id: "gardening", label: "Gardening", icon: Sprout },
  { id: "local", label: "Local life", icon: MapPin },
];

export const INTEREST_IDS = INTERESTS.map((i) => i.id);
export const interestById = (id) => INTERESTS.find((i) => i.id === id);
export const MAX_POST_TOPICS = 3;
export const MAX_INTERESTS = 12;

/* News desks. A story sits in exactly one. */
export const NEWS_TOPICS = [
  { id: "world", label: "World", icon: Globe2 },
  { id: "local", label: "Local", icon: MapPin },
  { id: "politics", label: "Politics", icon: Landmark },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "tech", label: "Tech", icon: Cpu },
  { id: "science", label: "Science", icon: FlaskConical },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "environment", label: "Environment", icon: Leaf },
  { id: "sport", label: "Sport", icon: Trophy },
  { id: "culture", label: "Culture", icon: Palette },
];
export const newsTopicById = (id) => NEWS_TOPICS.find((t) => t.id === id);

/* Topics worked out from what someone wrote, so nobody has to pick them:
   #music, "gig", "recipes", "cooking"... Each word also matches its plural
   and -ing / -ed forms. The strongest matches win, up to three; the author
   can still change them in the full composer. */
const HINTS = {
  music: ["music", "song", "gig", "album", "band", "concert", "playlist", "guitar", "piano", "singer", "spotify", "festival", "dj", "lyrics"],
  sport: ["footy", "afl", "nrl", "cricket", "soccer", "football", "basketball", "tennis", "match", "game day", "grand final", "rugby", "netball", "golf", "surf", "olympics", "f1"],
  fitness: ["gym", "run", "running", "workout", "training", "pb", "marathon", "lift", "cardio", "pilates", "yoga", "protein", "reps", "5k", "10k"],
  gaming: ["gaming", "gamer", "xbox", "playstation", "ps5", "nintendo", "switch game", "steam", "fps", "minecraft", "fortnite", "valorant", "rpg"],
  art: ["art", "drawing", "painting", "sketch", "illustration", "artist", "gallery", "canvas", "watercolour", "sculpture", "mural"],
  film: ["film", "movie", "cinema", "series", "tv show", "netflix", "trailer", "director", "actor", "screenplay", "binge"],
  books: ["book", "reading", "novel", "author", "library", "chapter", "bookclub", "poetry", "memoir", "kindle"],
  tech: ["tech", "code", "coding", "app", "ai", "software", "computer", "laptop", "iphone", "android", "startup app", "programming", "javascript", "python", "gadget"],
  science: ["science", "space", "physics", "biology", "chemistry", "research", "nasa", "planet", "experiment", "scientist", "telescope"],
  food: ["food", "recipe", "cooking", "dinner", "lunch", "brunch", "breakfast", "coffee", "restaurant", "baking", "bake", "cafe", "pasta", "pizza", "curry", "sushi", "dessert", "chef", "snack", "vegan", "eat"],
  travel: ["travel", "trip", "holiday", "flight", "roadtrip", "airport", "passport", "backpacking", "hotel", "vacation", "abroad", "itinerary"],
  fashion: ["fashion", "outfit", "style", "ootd", "sneakers", "thrift", "dress", "streetwear", "wardrobe"],
  wellbeing: ["wellbeing", "mindful", "mindfulness", "meditation", "self care", "therapy", "journaling", "burnout", "mental health"],
  nature: ["nature", "hike", "hiking", "bush", "ocean", "sunset", "camping", "beach", "mountain", "forest", "waterfall", "wildlife", "national park"],
  animals: ["dog", "cat", "puppy", "kitten", "pet", "animal", "bird", "horse", "rescue dog", "vet", "kangaroo", "koala"],
  photography: ["photo", "photography", "camera", "shot", "lens", "portrait", "film photo", "35mm", "golden hour"],
  comedy: ["funny", "comedy", "lol", "joke", "meme", "lmao", "standup", "hilarious"],
  learning: ["learn", "study", "uni", "school", "course", "exam", "assignment", "lecture", "tutorial", "homework", "degree"],
  business: ["business", "startup", "career", "job", "money", "invest", "marketing", "entrepreneur", "side hustle", "promotion", "interview", "salary"],
  cars: ["car", "drive", "engine", "motorbike", "ute", "horsepower", "detailing", "road trip car", "ev", "tesla"],
  podcasts: ["podcast", "radio", "episode", "listening to"],
  gardening: ["garden", "gardening", "plant", "veggie", "seedling", "compost", "succulent", "harvest", "tomatoes"],
  local: ["local", "neighbourhood", "suburb", "community", "council", "markets", "town"],
};
const FORMS = "(s|es|d|ed|ing|er|ers)?";
const PATTERNS = Object.fromEntries(Object.entries(HINTS).map(([id, words]) => [
  id, new RegExp(`(^|[^a-z0-9])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})${FORMS}(?=[^a-z0-9]|$)`, "g"),
]));

export function suggestTopics(text) {
  const t = String(text || "").toLowerCase();
  const scored = INTERESTS.map((i) => {
    const tagged = t.includes(`#${i.id}`) ? 3 : 0;
    const hits = (t.match(PATTERNS[i.id] || /$^/) || []).length;
    return { id: i.id, score: tagged + hits };
  }).filter((s) => s.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_POST_TOPICS).map((s) => s.id);
}
