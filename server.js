import express from "express";
import cors from "cors";

import { normalizeUrl } from "./utils/normalizeUrl.js";
import { getDomainAgeDays } from "./utils/getDomainAge.js";
import { getOpenPageRank } from "./utils/getOpenPageRank.js";
import { getDomainFromUrl } from "./utils/getDomainFromUrl.js";
import { checkSafeBrowsing } from "./utils/checkSafeBrowsing.js";
import { checkTransparencyReport } from "./utils/checkTransparencyReport.js";
import { isVerifiedDomain } from "./utils/verifyDomain.js";
import {
  fetchLinkedInContactsFromDomains,
  storeLinkedInContacts,
} from "./utils/linkedInscrapper.js";
import { extractDomainsFromPrompt } from "./utils/chatGPTAnalysis.js";
import { db } from "./utils/db.js";
import { crawlPageForEmails } from "./utils/urlScrapper.js";

const app = express();
app.use(
  cors({
    origin: "*",
    // origin: "http://localhost:3001", // your React frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

const SPAMMY_TERMS = [
  "casino",
  "bet",
  "porn",
  "viagra",
  "loan",
  "escort",
  "cheap",
  "xxx",
  "adult",
  "sex",
  "gambling",
  "pharma",
];
const SUSPICIOUS_TLDS_REGEX =
  /\.(xyz|top|click|gdn|cn|ru|tk|ml|ga|cf|gq|club|site|online|bid|win|loan|download)$/i;

function classifyTrust(score, verified) {
  const penalties = Object.values(verified).reduce(
    (sum, v) => sum + (v ? 0 : 5),
    0
  );
  const adjustedScore = score - penalties;

  if (adjustedScore >= 90) return "High";
  if (adjustedScore >= 70) return "Medium";
  return "Low";
}

async function analyzeUrl(url) {
  const reason = [];
  let score = 100;

  const domain = getDomainFromUrl(url);
  if (!domain) {
    return {
      url,
      reason: ["Invalid URL"],
      safe_browsing: false,
      domain_age_days: -1,
      score: 0,
      trust_level: "Low",
    };
  }

  if (SPAMMY_TERMS.some((term) => domain.toLowerCase().includes(term))) {
    reason.push("Spammy term");
    score -= 30;
  }

  if (SUSPICIOUS_TLDS_REGEX.test(domain.toLowerCase())) {
    reason.push("Suspicious TLD");
    score -= 20;
  }

  if ((domain.match(/-/g) || []).length > 3) {
    reason.push("Too many hyphens");
    score -= 10;
  }

  if (domain.length > 60) {
    reason.push("Long domain");
    score -= 10;
  }

  const domainAge = await getDomainAgeDays(domain);
  if (domainAge === -1) {
    reason.push("WHOIS failed");
    score -= 5;
  } else if (domainAge < 90) {
    reason.push("Young domain");
    score -= 15;
  }

  const transparencyOk = await checkTransparencyReport(domain);
  if (!transparencyOk) {
    reason.push("No data on transparency report");
    score -= 10;
  }

  const safeBrowsing = await checkSafeBrowsing(normalizeUrl(url));
  if (!safeBrowsing) {
    reason.push("Flagged by Safe Browsing");
    score -= 50;
  }
  const openPR = await getOpenPageRank(domain);
  if (openPR.page_rank !== null) {
    if (openPR.page_rank < 3) {
      reason.push("Low PageRank");
      score -= 10;
    }
  } else {
    reason.push("PageRank not available");
  }

  const verified = await isVerifiedDomain(domain);
  const trustLevel = classifyTrust(score, verified);

  return {
    url,
    reason,
    safe_browsing: safeBrowsing,
    domain_age_days: domainAge,
    page_rank: openPR.page_rank,
    score: Math.max(0, score),
    ...verified,
    trust_level: trustLevel,
  };
}

app.post("/analyze", async (req, res) => {
  const domains = req.body.domains;
  if (!Array.isArray(domains)) {
    return res
      .status(400)
      .json({ error: "'domains' must be an array of URLs/domains" });
  }

  const results = [];
  for (const url of domains) {
    try {
      const result = await analyzeUrl(url);
      results.push(result);
    } catch (e) {
      results.push({ url, error: e.message || "Error analyzing URL" });
    }
  }

  res.json({ results });
});

app.post("/chatgpt-analyze-only", async (req, res) => {
  const { prompt, client, user, niche } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "'prompt' must be a string" });
  }
  try {
    const domains = await extractDomainsFromPrompt(prompt);

    if (!domains.length) {
      return res
        .status(404)
        .json({ error: "No domains could be extracted from the prompt." });
    }
    //
    const results = [];
    for (const domain of domains) {
      try {
        const result = await analyzeUrl(`https://${domain}`);
        // result.linked_in = linkedInContacts;
        results.push(result);
      } catch (e) {
        results.push({
          url: domain,
          error: e.message || "Error analyzing domain",
        });
      }
    }

    res.json({ extracted_domains: domains, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze domains from prompt" });
  }
});

app.post("/chatgpt-analyze", async (req, res) => {
  const { prompt, client, user, niche } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "'prompt' must be a string" });
  }

  try {
    const domains = await extractDomainsFromPrompt(prompt);

    if (!domains.length) {
      return res
        .status(404)
        .json({ error: "No domains could be extracted from the prompt." });
    }

    // Insert prompt metadata
    const [promptResult] = await db.execute(
      "INSERT INTO prompts (prompt, client, user, niche) VALUES (?, ?, ?, ?)",
      [prompt, client || null, user || null, niche || null]
    );
    const promptId = promptResult.insertId;

    // Analyze and store domains
    const results = [];
    for (const domain of domains) {
      try {
        const result = await analyzeUrl(`https://${domain}`);

        // Insert domain record
        const [domainResult] = await db.execute(
          `INSERT INTO domains 
            (prompt_id, domain, score, trust_level, safe_browsing, domain_age, page_rank, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            promptId,
            domain,
            result.score,
            result.trust_level,
            result.safe_browsing,
            result.domain_age_days,
            result.page_rank || null,
            result.reason.join(", "),
          ]
        );

        const domainId = domainResult.insertId;

        // Fetch LinkedIn contacts
        const linkedInContacts = await fetchLinkedInContactsFromDomains(domain);

        // Insert LinkedIn contacts (if any)
        for (const contact of linkedInContacts) {
          await db.execute(
            `INSERT INTO linkedin_contacts 
              (domain_id, linkedin_profile_url, name, job_title, guessed_emails, notes)
              VALUES (?, ?, ?, ?, ?, ?)`,
            [
              domainId,
              contact.LinkedIn_Profile_URL,
              contact.Name,
              contact.Job_Title_Guessed,
              JSON.stringify(contact.Guessed_Emails || []),
              contact.Notes || "",
            ]
          );
        }

        // Append to result
        result.linked_in = linkedInContacts;
        results.push(result);
      } catch (e) {
        results.push({
          url: domain,
          error: e.message || "Error analyzing domain",
        });
      }
    }

    // Append to result
    res.json({ extracted_domains: domains, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze domains from prompt" });
  }
});

app.get("/prompts", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM prompts");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch prompts" });
  }
});

app.get("/domains", async (req, res) => {
  try {
    const [domains] = await db.execute("SELECT * FROM domains");

    // Add has_linked_in field
    for (const domain of domains) {
      const [contacts] = await db.execute(
        "SELECT COUNT(*) as count FROM linkedin_contacts WHERE domain_id = ?",
        [domain.id]
      );
      domain.has_linked_in = contacts[0].count > 0;
    }

    res.json(domains);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch domains" });
  }
});

app.get("/contacts", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM linkedin_contacts");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch LinkedIn contacts" });
  }
});

app.get("/prompt/:id", async (req, res) => {
  const promptId = req.params.id;

  const [promptRows] = await db.execute("SELECT * FROM prompts WHERE id = ?", [
    promptId,
  ]);
  if (!promptRows.length)
    return res.status(404).json({ error: "Prompt not found" });

  const [domainRows] = await db.execute(
    "SELECT * FROM domains WHERE prompt_id = ?",
    [promptId]
  );

  res.json({ prompt: promptRows[0], domains: domainRows });
});

app.get("/domain/:id", async (req, res) => {
  const domainId = req.params.id;

  try {
    // Fetch the domain by ID
    const [domains] = await db.execute("SELECT * FROM domains WHERE id = ?", [
      domainId,
    ]);
    if (domains.length === 0) {
      return res.status(404).json({ error: "Domain not found" });
    }
    const domain = domains[0];

    // Fetch LinkedIn contacts for the domain
    const [contacts] = await db.execute(
      "SELECT * FROM linkedin_contacts WHERE domain_id = ?",
      [domainId]
    );

    // Add contacts array to domain object
    domain.linkedin_contacts = contacts;

    res.json(domain);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch domain" });
  }
});

app.post("/scrape-emails", async (req, res) => {
  const { domains } = req.body;
  const results = await crawlPageForEmails(domains);
  res.json({ results });
  try {
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to crawl websites" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Domain trust analyzer listening on port ${PORT}`)
);
