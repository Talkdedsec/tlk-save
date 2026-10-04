import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, parseTime, qualityLabel } from "./format";
import { MESSAGES, errorKey, translate } from "./i18n";
import { detectPlatform, extractUrl, looksLikeUrl } from "./platforms";

describe("i18n", () => {
  it("has the same keys and placeholders in both languages", () => {
    const tr = MESSAGES.tr;
    const en = MESSAGES.en;
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(tr) as (keyof typeof tr)[]) {
      expect(vars(en[key]), key).toEqual(vars(tr[key]));
      expect(en[key].trim(), key).not.toBe("");
    }
  });

  it("has a message for every error code the server sends", () => {
    const codes = [
      "invalid_url", "unsupported", "playlist", "live", "private", "age_restricted", "login_required",
      "geo_blocked", "too_long", "too_large", "upstream_limited", "bot_check", "unavailable",
      "rate_limited", "busy", "timeout", "engine_missing", "not_found", "invalid_option", "invalid_section", "server_full", "cancelled",
      "failed", "network", "no_server",
    ];
    for (const code of codes) expect(errorKey(code)).toBe(`error.${code}`);
    expect(errorKey("something_new")).toBe("error.failed");
  });

  it("fills placeholders", () => {
    expect(translate("en", "error.too_long", { hours: 4 })).toContain("4 hours");
  });
});

describe("links", () => {
  it("finds the link in share texts", () => {
    expect(extractUrl("Bak bu https://vm.tiktok.com/ZMabc/ #fyp")).toBe("https://vm.tiktok.com/ZMabc/");
    expect(extractUrl("youtu.be/jNQXAC9IVRw")).toBe("https://youtu.be/jNQXAC9IVRw");
    expect(extractUrl("watch this: https://x.com/a/status/1.")).toBe("https://x.com/a/status/1");
  });

  it("tells links from other text", () => {
    expect(looksLikeUrl("https://www.youtube.com/watch?v=1")).toBe(true);
    expect(looksLikeUrl("instagram.com/reel/abc")).toBe(true);
    expect(looksLikeUrl("hello world")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });

  it("recognises platforms by host, including subdomains", () => {
    expect(detectPlatform("https://m.youtube.com/watch?v=1")?.id).toBe("youtube");
    expect(detectPlatform("https://vm.tiktok.com/x/")?.id).toBe("tiktok");
    expect(detectPlatform("https://twitter.com/a/status/1")?.id).toBe("x");
    expect(detectPlatform("https://notyoutube.com/")).toBeUndefined();
  });
});

describe("format", () => {
  it("formats sizes", () => {
    expect(formatBytes(0, "en")).toBe("0 B");
    expect(formatBytes(1_600_000, "en")).toBe("1.53 MB");
    expect(formatBytes(599_055_084, "en")).toBe("571 MB");
    expect(formatBytes(null, "en")).toBe("");
  });

  it("formats durations", () => {
    expect(formatDuration(19)).toBe("0:19");
    expect(formatDuration(634)).toBe("10:34");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("names qualities", () => {
    expect(qualityLabel(2160)).toBe("4K");
    expect(qualityLabel(1080)).toBe("1080p");
    expect(qualityLabel(undefined)).toBe("Best");
  });
});

describe("parseTime", () => {
  it("reads the ways people type times", () => {
    expect(parseTime("90")).toBe(90);
    expect(parseTime("1:30")).toBe(90);
    expect(parseTime(" 1:02:05 ")).toBe(3725);
    expect(parseTime("0:07.5")).toBe(7.5);
    expect(parseTime("0:07,5")).toBe(7.5);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "abc", "1:75", "1:2:3:4", "-5", "1.5:30", "1::30"]) {
      expect(parseTime(bad), bad).toBeNull();
    }
  });
});
