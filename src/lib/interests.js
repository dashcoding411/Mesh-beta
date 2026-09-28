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

/* Suggest topics from what someone wrote: #music, "gig", "recipe"… Only a
   nudge in the composer; the author always decides. */
const HINTS = {
  music: ["music", "song", "gig", "album", "band", "concert", "playlist", "guitar"],
  sport: ["footy", "afl", "nrl", "cricket", "soccer", "football", "basketball", "tennis", "match", "game day"],
  fitness: ["gym", "run", "workout", "training", "pb", "marathon", "lift"],
  gaming: ["gaming", "game", "xbox", "playstation", "nintendo", "steam", "fps"],
  art: ["art", "drawing", "painting", "design", "sketch", "illustration"],
  film: ["film", "movie", "cinema", "series", "episode", "tv"],
  books: ["book", "reading", "novel", "author", "library"],
  tech: ["tech", "code", "coding", "app", "ai", "software", "computer", "phone"],
  science: ["science", "space", "physics", "biology", "chemistry", "research"],
  food: ["food", "recipe", "cooking", "dinner", "lunch", "brunch", "coffee", "restaurant", "baking"],
  travel: ["travel", "trip", "holiday", "flight", "beach", "roadtrip"],
  fashion: ["fashion", "outfit", "style", "fit", "ootd"],
  wellbeing: ["wellbeing", "mindful", "meditation", "sleep", "self care"],
  nature: ["nature", "hike", "hiking", "bush", "ocean", "sunset", "camping"],
  animals: ["dog", "cat", "puppy", "kitten", "pet", "animals", "bird"],
  photography: ["photo", "photography", "camera", "shot", "lens"],
  comedy: ["funny", "comedy", "lol", "joke", "meme"],
  learning: ["learn", "study", "uni", "school", "course", "exam"],
  business: ["business", "startup", "work", "career", "job", "money"],
  cars: ["car", "cars", "drive", "engine", "motorbike"],
  podcasts: ["podcast", "radio", "episode"],
  gardening: ["garden", "gardening", "plants", "veggie"],
  local: ["local", "neighbourhood", "suburb", "community"],
};

export function suggestTopics(text) {
  const t = ` ${String(text || "").toLowerCase()} `;
  return INTERESTS
    .filter((i) => t.includes(`#${i.id}`) || (HINTS[i.id] || []).some((w) => new RegExp(`[^a-z]${w}[^a-z]`).test(t)))
    .map((i) => i.id)
    .slice(0, MAX_POST_TOPICS);
}
