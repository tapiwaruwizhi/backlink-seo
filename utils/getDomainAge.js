import whois from "whois";

function parseWhoisCreationDate(data) {
  // naive extraction of creation date from whois raw text
  // tries to find "Creation Date" or "created" or "Registered On" etc.
  const lines = data.split("\n");
  for (let line of lines) {
    line = line.toLowerCase();
    if (
      line.includes("creation date") ||
      line.includes("created on") ||
      line.includes("registered on") ||
      line.includes("domain registration date") ||
      line.includes("created")
    ) {
      const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        return new Date(dateMatch[0]);
      }
    }
  }
  return null;
}

export async function getDomainAgeDays(domain) {
  try {
    const rawWhois = await new Promise((resolve, reject) => {
      whois.lookup(domain, { follow: 3 }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    const creationDate = parseWhoisCreationDate(rawWhois);
    if (!creationDate) return -1;
    const ageMs = Date.now() - creationDate.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  } catch {
    return -1;
  }
}

// module.exports = getDomainAgeDays;