export const cleanText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

export const slugifyKey = (value: string): string =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "unknown";

export const extractUsernameFromUrl = (url: string): string | undefined => {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean)[0];
    return segment || undefined;
  } catch {
    return undefined;
  }
};

export const profileBaseUrl = (url: string): string => {
  const username = extractUsernameFromUrl(url);
  if (!username) throw new Error(`Could not resolve profile base URL from ${url}`);
  return `https://www.facebook.com/${username}`;
};
