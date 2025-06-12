import OpenAI from "openai";
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractDomainsFromPrompt(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content:
            prompt +
            "\n\nReturn only a list of real domain names (one per line), no descriptions or explanations.",
        },
      ],
      max_tokens: 300,
    });

    const content = response.choices[0].message.content.trim();
    const lines = content.split("\n");

    // Extract domains using a simple regex
    const domains = lines
      .map((line) => {
        const match = line.match(
          /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-z]{2,})/
        );
        return match ? match[1].toLowerCase() : null;
      })
      .filter(Boolean);

    return domains;
  } catch (err) {
    console.error("GPT domain extraction failed:", err);
    return [];
  }
}

export async function extractMoreDomainsFromPrompt({
  prompt,
  previousDomains = [],
}) {
  try {
    const exclusionNote = previousDomains.length
      ? `\nExclude these domains:\n${previousDomains.join("\n")}`
      : "";

    const userMessage = {
      role: "user",
      content:
        prompt +
        exclusionNote +
        "\n\nReturn only a list of new, real domain names (one per line), no descriptions or explanations.",
    };

    const messages = [...conversationHistory, userMessage];

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 400,
    });

    const content = response.choices[0].message.content.trim();
    const lines = content.split("\n");

    const newDomains = lines
      .map((line) => {
        const match = line.match(
          /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-z]{2,})/
        );
        return match ? match[1].toLowerCase() : null;
      })
      .filter(
        (domain) =>
          domain &&
          !previousDomains.includes(domain) // avoid duplicates
      );

    return {
      newDomains,
    };
  } catch (err) {
    console.error("GPT domain extraction failed:", err);
    return {
      newDomains: [],
    };
  }
}

