import axios from "axios";
import {URL} from 'url'
import dotenv from 'dotenv';
dotenv.config();

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX


const MAX_CONTACTS_PER_COMPANY = 10;
const SEARCH_DELAY_MS = 1000;

const JOB_TITLE_KEYWORDS = [
  "SEO Manager", "SEO Specialist", "Head of SEO", "Content Manager",
  "Content Strategist", "Editor", "Copywriter", "Digital Marketing Manager",
  "Marketing Director", "Link Building Specialist", "Outreach Specialist"
];

const EMAIL_PATTERNS = [
  "{fi}{l}@{domain}", "{f}.{l}@{domain}", "{f}{l}@{domain}",
  "{f}@{domain}", "{l}@{domain}", "{f}_{l}@{domain}",
  "{f}-{l}@{domain}", "{li}{f}@{domain}", "{f}{li}@{domain}"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanDomain(input) {
  try {
    let domain = input;
    if (!/^https?:\/\//i.test(domain)) {
      domain = 'http://' + domain;
    }
    const parsed = new URL(domain);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function cleanName(name) {
  if (typeof name !== 'string') return ['', ''];
  name = name.replace(/\s*\(.*?\)\s*/g, '')
             .replace(/[\u200b-\u200f\ufeff]/g, '')
             .toLowerCase().trim();
  const parts = name.split(/\s+/);
  return [parts[0] || '', parts[parts.length - 1] || ''];
}

function generateEmails(first, last, domain) {
  if (!domain) return [];
  const fi = first.charAt(0);
  const li = last.charAt(0);
  return EMAIL_PATTERNS.map(p =>
    p.replace('{f}', first)
     .replace('{l}', last)
     .replace('{fi}', fi)
     .replace('{li}', li)
     .replace('{domain}', domain)
  );
}

async function getLinkedInProfiles(domain, roleKeywords, maxResults = 10) {
  const roleQuery = roleKeywords.map(k => `"${k}"`).join(' OR ');
  const query = `site:linkedin.com/in/ ${domain} (${roleQuery})`;

  const params = {
    key: GOOGLE_CSE_API_KEY,
    cx: GOOGLE_CSE_CX,
    q: query,
    num: Math.min(maxResults, 10)
  };

  try {
    const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
    console.log({data})
    console.log(data)
    if (!data.items) return [];

    return data.items.map(item => {
      let name = '';
      let job = '';
      const title = item.title || '';
      const snippet = item.snippet || '';

      const parts = title.split(/ \| | - /);
      if (parts.length > 0 && !parts[0].toLowerCase().includes('linkedin')) {
        name = parts[0].trim();
        if (parts[1] && !parts[1].toLowerCase().includes(domain)) {
          job = parts[1].trim();
        }
      }

      if (!name && snippet) {
        const match = snippet.match(/([\w\s.-]+) at /i);
        if (match) name = match[1].trim();
      }

      if (!job && snippet) {
        for (const keyword of roleKeywords) {
          if (snippet.toLowerCase().includes(keyword.toLowerCase())) {
            job = keyword;
            break;
          }
        }
      }

      return {
        Domain: domain,
        LinkedIn_Profile_URL: item.link,
        Name: name,
        Job_Title_Guessed: job,
        Source_Title: title,
        Source_Snippet: snippet
      };
    });
  } catch (error) {
    console.error(`Error fetching profiles for ${domain}:`, error.message);
    return [];
  }
}

export async function fetchLinkedInContactsFromDomains(rawDomain) {

const domain = cleanDomain(rawDomain);
  console.log(rawDomain)
  if (!domain) {
    return [{
      Domain: rawDomain,
      LinkedIn_Profile_URL: '',
      Name: '',
      Job_Title_Guessed: '',
      Guessed_Emails: [],
      Notes: 'Invalid domain'
    }];
  }


  console.log(domain)
  const profiles = await getLinkedInProfiles(domain, JOB_TITLE_KEYWORDS, MAX_CONTACTS_PER_COMPANY * 2);
  console.log(profiles)
  const seen = new Set();
  const results = [];
  

  for (const profile of profiles) {
    if (results.length >= MAX_CONTACTS_PER_COMPANY) break;

    const url = profile.LinkedIn_Profile_URL;
    if (!seen.has(url)) {
      seen.add(url);
      const [f, l] = cleanName(profile.Name || '');
      const emails = generateEmails(f, l, domain);
      profile.Guessed_Emails = emails;
      profile.Notes = '';
      results.push(profile);
    }
  }

  if (results.length === 0) {
    return [{
      Domain: domain,
      LinkedIn_Profile_URL: '',
      Name: '',
      Job_Title_Guessed: '',
      Guessed_Emails: [],
      Notes: 'No LinkedIn profiles found'
    }];
  }

  console.log(results)
  return results;
}

