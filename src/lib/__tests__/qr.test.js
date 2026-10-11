import { describe, expect, it } from "vitest";
import { meshLink } from "../qr.js";

const here = "https://joinmesh.social";

describe("Mesh links in a QR code", () => {
  it("knows Mesh's shareable pages and says what each opens", () => {
    expect(meshLink("https://joinmesh.social/rolls/Ab12Cd34Ef56Gh78Ij90", here)).toEqual({ path: "/rolls/Ab12Cd34Ef56Gh78Ij90", label: "Join this roll" });
    expect(meshLink("https://www.joinmesh.social/@The_Admin", here)).toEqual({ path: "/@The_Admin", label: "Open @the_admin" });
    expect(meshLink("https://joinmesh.social/p/abc123def/", here)).toEqual({ path: "/p/abc123def", label: "Open the post" });
    expect(meshLink("https://joinmesh.social/gatherings/g1234", here)?.label).toBe("Open the gathering");
    expect(meshLink("https://joinmesh.social/circles/c1234", here)?.label).toBe("Open the circle");
    expect(meshLink("https://joinmesh.social/news/n1234", here)?.label).toBe("Read the story");
    expect(meshLink("https://joinmesh.social/leaderboard/g/bg1234", here)?.label).toBe("Join the Brick group");
  });

  it("finds the link inside other words", () => {
    expect(meshLink("come join! https://joinmesh.social/rolls/Ab12Cd34Ef56 see you there", here)?.path).toBe("/rolls/Ab12Cd34Ef56");
  });

  it("ignores other sites, other pages and plain text", () => {
    expect(meshLink("https://evil.example/rolls/Ab12Cd34Ef56", here)).toBeNull();
    expect(meshLink("https://joinmesh.social/account/settings", here)).toBeNull();
    expect(meshLink("https://joinmesh.social/", here)).toBeNull();
    expect(meshLink("WIFI:S:home;T:WPA;P:secret;;", here)).toBeNull();
    expect(meshLink("", here)).toBeNull();
  });

  it("accepts the site it's running on (local development)", () => {
    expect(meshLink("http://localhost:5173/rolls/Ab12Cd34Ef56", "http://localhost:5173")?.path).toBe("/rolls/Ab12Cd34Ef56");
  });
});
