import { URL } from "url";
import { normalizeUrl } from "./normalizeUrl.js";

export function getDomainFromUrl(url) {
  try {
    const parsedUrl = new URL(normalizeUrl(url));
    return parsedUrl.hostname;
  } catch {
    return null;
  }
}
