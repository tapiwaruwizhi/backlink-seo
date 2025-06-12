import axios from "axios";
import * as cheerio from "cheerio";
import emailRegex from "email-regex";

export async function crawlPageForEmails(domains) {
  if (!Array.isArray(domains)) {
    return "Domains must be an array";
  }

  const results = await Promise.all(
    domains.map(async (domain) => {
      let allEmails = new Set();
      const checkedUrls = new Set();

      const baseVariants = [
        `https://${domain.replace(/^www\./, "")}`,
        `https://www.${domain.replace(/^www\./, "")}`,
      ];

      for (const base of baseVariants) {
        const homepageUrl = `${base}/`;
        try {
          const { data } = await axios.get(homepageUrl, { timeout: 8000 });
          const $ = cheerio.load(data);

          // Collect links with text about/contact/info
          const relevantLinks = new Set();

          $("a").each((_, el) => {
            const text = $(el).text().toLowerCase();
            const href = $(el).attr("href");
            // if (
            //   href &&
            //   (text.includes("about") ||
            //     text.includes("contact") ||
            //     text.includes("info")) &&
            //   !href.startsWith("http") // keep internal only
            // ) {
              let fullUrl = href.startsWith("/")
                ? `${href}`
                : `${href}`;
              fullUrl = fullUrl
                .replace(/\/\/+/g, "/")
                .replace("https:/", "https://");
              relevantLinks.add(fullUrl);
            // }
          });

          // Add the homepage too
          relevantLinks.add(homepageUrl);
          console.log(relevantLinks)

          // Crawl each of those pages
          for (const url of relevantLinks) {
            if (checkedUrls.has(url)) continue;
            checkedUrls.add(url);

            try {
              const { data: pageData } = await axios.get(url, {
                timeout: 8000,
              });
              const $ = cheerio.load(pageData);
              const text = $("body").text();

              // From mailto:
              $('a[href^="mailto:"]').each((_, el) => {
                const href = $(el).attr("href");
                const email = href
                  .replace(/^mailto:/i, "")
                  .split("?")[0]
                  .trim();
                if (emailRegex({ exact: true }).test(email)) {
                  allEmails.add(email.toLowerCase());
                }
              });

              console.log(allEmails);
              // From visible text
              const rawTextEmails =
                text.match(emailRegex({ exact: false, strict: false })) || [];
              const cleanedTextEmails = rawTextEmails.map((email) =>
                email
                  .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
                  .toLowerCase()
              );
              //   cleanedTextEmails.forEach((email) => allEmails.add(email));
            } catch (err) {
              console.warn(`Failed to crawl ${url}:`, err.message);
            }
          }
        } catch (err) {
          console.warn(`Failed to load homepage ${homepageUrl}:`, err.message);
        }
      }

      return {
        domain,
        emails: Array.from(allEmails),
      };
    })
  );

  return results;
}
