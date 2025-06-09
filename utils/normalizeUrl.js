export function normalizeUrl(url) {
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) {
    return "http://" + url;
  }
  return url;
}

// module.exports = normalizeUrl;
