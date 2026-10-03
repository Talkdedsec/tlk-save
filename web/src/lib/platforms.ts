import {
  siBilibili,
  siBluesky,
  siDailymotion,
  siFacebook,
  siInstagram,
  siKick,
  siPinterest,
  siReddit,
  siSnapchat,
  siSoundcloud,
  siThreads,
  siTiktok,
  siTumblr,
  siTwitch,
  siVimeo,
  siX,
  siYoutube,
} from "simple-icons";

export interface Platform {
  id: string;
  name: string;
  /** SVG path on a 24×24 box, from Simple Icons (CC0). */
  path: string;
  /** Brand colour, used sparingly: hover and the detected-site badge. */
  color: string;
  hosts: string[];
  /** Shown in the strip of supported sites under the input. */
  featured: boolean;
}

const p = (
  id: string,
  icon: { title: string; path: string; hex: string },
  hosts: string[],
  featured = true,
  name = icon.title,
): Platform => ({ id, name, path: icon.path, color: `#${icon.hex}`, hosts, featured });

export const PLATFORMS: Platform[] = [
  p("youtube", siYoutube, ["youtube.com", "youtu.be", "youtube-nocookie.com"]),
  p("tiktok", siTiktok, ["tiktok.com"]),
  p("instagram", siInstagram, ["instagram.com", "instagr.am"]),
  p("x", siX, ["x.com", "twitter.com"], true, "X"),
  p("facebook", siFacebook, ["facebook.com", "fb.watch", "fb.com"]),
  p("reddit", siReddit, ["reddit.com", "redd.it"]),
  p("twitch", siTwitch, ["twitch.tv"]),
  p("soundcloud", siSoundcloud, ["soundcloud.com", "snd.sc"]),
  p("vimeo", siVimeo, ["vimeo.com"]),
  p("pinterest", siPinterest, ["pinterest.com", "pin.it"]),
  p("dailymotion", siDailymotion, ["dailymotion.com", "dai.ly"]),
  p("bilibili", siBilibili, ["bilibili.com", "b23.tv"]),
  p("threads", siThreads, ["threads.net", "threads.com"], false),
  p("bluesky", siBluesky, ["bsky.app"], false),
  p("snapchat", siSnapchat, ["snapchat.com"], false),
  p("kick", siKick, ["kick.com"], false),
  p("tumblr", siTumblr, ["tumblr.com"], false),
];

const BY_ID = new Map(PLATFORMS.map((platform) => [platform.id, platform]));

export function platformById(id: string | undefined): Platform | undefined {
  return id ? BY_ID.get(id) : undefined;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

/** The link inside a share text like "look https://vm.tiktok.com/x/ #fyp". */
export function extractUrl(text: string): string {
  const trimmed = text.trim();
  const match = URL_IN_TEXT.exec(trimmed);
  if (match) return match[0].replace(/[).,;!?]+$/, "");
  if (trimmed && !/\s/.test(trimmed) && /\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function looksLikeUrl(text: string): boolean {
  try {
    const url = new URL(extractUrl(text));
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function detectPlatform(text: string): Platform | undefined {
  let host: string;
  try {
    host = new URL(extractUrl(text)).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
  return PLATFORMS.find((platform) =>
    platform.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
}
