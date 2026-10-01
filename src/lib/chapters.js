// Chapters from a video description: one per line, "0:00 Intro" or
// "1:02:30 - The end". Like YouTube, there have to be at least two and the
// first has to start at 0:00, so a stray timestamp doesn't make a chapter list.

const LINE = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:]?\s+(\S.*)$/;

export function parseChapters(text) {
  const chapters = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.trim().match(LINE);
    if (!m || Number(m[3]) > 59) continue;
    chapters.push({ at: Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]), title: m[4].trim().slice(0, 80) });
  }
  chapters.sort((a, b) => a.at - b.at);
  return chapters.length >= 2 && chapters[0].at === 0 ? chapters : [];
}

/** Index of the chapter playing at `seconds`. */
export function chapterAt(chapters, seconds) {
  let i = 0;
  while (i + 1 < chapters.length && chapters[i + 1].at <= seconds) i += 1;
  return i;
}
