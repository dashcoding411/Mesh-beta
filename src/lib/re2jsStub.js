// Stands in for the RE2JS regex engine, which Firestore bundles only for the
// regex functions of "pipeline" queries (like, regex_contains, regex_match).
// Mesh never runs pipeline queries, so this keeps about 140 kB out of every
// load. Firestore catches the error and treats such an expression as failed.
// Remove it (in vite.config.js) if Mesh ever uses pipelines.
export const RE2JS = {
  compile() {
    throw new Error("Regex pipeline functions aren't available in this build of Mesh.");
  },
};
