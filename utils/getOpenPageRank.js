import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

export async function getOpenPageRank(domain) {
  try {
    const apiKey = process.env.OPEN_PAGE_API_KEY; 
    const response = await axios.get(
      `https://openpagerank.com/api/v1.0/getPageRank?domains[]=${domain}`,
      {
        headers: {
          "API-OPR": apiKey,
        },
        timeout: 5000,
      }
    );

    const result = response.data.response[0];
    return {
      domain: result.domain,
      page_rank: result.page_rank_integer ?? null,
    };
  } catch (error) {
    return {
      domain,
      page_rank: null,
      page_rank_error: error.message,
    };
  }
}

// module.exports = getOpenPageRank;
