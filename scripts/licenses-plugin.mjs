// Build step: writes licenses.txt, the name, version, licence and licence
// text of every open-source package that ends up in the app's bundle, as
// their licences (MIT, ISC, Apache and so on) ask.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The package directory a bundled file belongs to, or null for Mesh's own code. */
export function packageDirOf(id) {
  const clean = id.replace(/^\0/, "").split("?")[0];
  const at = clean.lastIndexOf("/node_modules/");
  if (at < 0) return null;
  const rest = clean.slice(at + "/node_modules/".length).split("/");
  const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  return { dir: `${clean.slice(0, at)}/node_modules/${name}`, name };
}

function licenseText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\..*)?$/i.test(f));
  return file ? readFileSync(join(dir, file), "utf8").trim() : "";
}

export default function licenses() {
  return {
    name: "mesh-licenses",
    apply: "build",
    generateBundle(_, bundle) {
      const packages = new Map();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules)) {
          const pkg = packageDirOf(id);
          if (!pkg || packages.has(pkg.name) || !existsSync(join(pkg.dir, "package.json"))) continue;
          const meta = JSON.parse(readFileSync(join(pkg.dir, "package.json"), "utf8"));
          // Some packages ship an inner package.json with only "type"; skip those.
          if (!meta.name) continue;
          const license = typeof meta.license === "string" ? meta.license : meta.license?.type || "See below";
          packages.set(pkg.name, { name: meta.name, version: meta.version, license, text: licenseText(pkg.dir) });
        }
      }
      const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
      const body = [
        "Mesh is built with these open-source packages. Thank you to everyone who made them.",
        `${list.length} packages.`,
        "",
        ...list.map((p) => [
          "-".repeat(72),
          `${p.name} ${p.version}`,
          `Licence: ${p.license}`,
          "",
          p.text || "(No licence file was included in the package; see its licence field above.)",
          "",
        ].join("\n")),
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "licenses.txt", source: body });
    },
  };
}
