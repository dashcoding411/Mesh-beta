// The newsroom's folders: moving, deleting and naming never lose a story or
// make a folder its own ancestor.
import { describe, expect, it } from "vitest";
import {
  ROOT, emptyDesk, createFolder, renameFolder, moveItems, deleteFolder, childFolders, pathTo,
  folderOf, canMoveFolder, prune, uniqueName,
} from "../desk.js";

const build = () => {
  let d = emptyDesk();
  d = createFolder(d, { id: "a", name: "Politics" });
  d = createFolder(d, { id: "b", name: "Elections", parent: "a" });
  d = createFolder(d, { id: "c", name: "Sport" });
  d = moveItems(d, { stories: ["s1"] }, "b");
  d = moveItems(d, { stories: ["s2"] }, "a");
  return d;
};

describe("desk", () => {
  it("lists folders by name and builds paths", () => {
    const d = build();
    expect(childFolders(d).map((f) => f.name)).toEqual(["Politics", "Sport"]);
    expect(pathTo(d, "b").map((f) => f.name)).toEqual(["Politics", "Elections"]);
    expect(folderOf(d, "s1")).toBe("b");
    expect(folderOf(d, "nowhere")).toBe(ROOT);
  });

  it("gives clashing names a number", () => {
    let d = build();
    d = createFolder(d, { id: "d", name: "politics" });
    expect(d.folders.d.name).toBe("politics (2)");
    expect(uniqueName(d, ROOT, "  ")).toBe("New folder");
    d = renameFolder(d, "c", "Politics");
    expect(d.folders.c.name).toBe("Politics (3)");
  });

  it("won't move a folder into itself or its own subfolder", () => {
    const d = build();
    expect(canMoveFolder(d, "a", "b")).toBe(false);
    expect(canMoveFolder(d, "a", "a")).toBe(false);
    const moved = moveItems(d, { folders: ["a"] }, "b");
    expect(moved.folders.a.parent).toBe(ROOT);
    expect(moveItems(d, { folders: ["c"] }, "b").folders.c.parent).toBe("b");
  });

  it("moves stories, and back to the top", () => {
    let d = moveItems(build(), { stories: ["s1", "s3"] }, "c");
    expect(folderOf(d, "s1")).toBe("c");
    d = moveItems(d, { stories: ["s1"] }, ROOT);
    expect(folderOf(d, "s1")).toBe(ROOT);
    expect("s1" in d.placements).toBe(false);
  });

  it("deleting a folder moves what was in it up a level", () => {
    const d = deleteFolder(build(), "a");
    expect(d.folders.a).toBeUndefined();
    expect(d.folders.b.parent).toBe(ROOT);
    expect(folderOf(d, "s2")).toBe(ROOT);
    expect(folderOf(d, "s1")).toBe("b");
    const inner = deleteFolder(build(), "b");
    expect(folderOf(inner, "s1")).toBe("a");
  });

  it("forgets stories that are gone", () => {
    const d = prune(build(), ["s1"]);
    expect(Object.keys(d.placements)).toEqual(["s1"]);
  });
});
