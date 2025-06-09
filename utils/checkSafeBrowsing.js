import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

const SAFE_BROWSING_API_KEY = process.env.SAFE_BROWSING_API_KEY;

export async function checkSafeBrowsing(url) {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
    const payload = {
        client: { clientId: "seo-checker", clientVersion: "1.0" },
        threatInfo: {
            threatTypes: [
                "MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE",
                "POTENTIALLY_HARMFUL_APPLICATION", "THREAT_TYPE_UNSPECIFIED"
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }]
        }
    };

    try {
        const response = await axios.post(endpoint, payload);
        return !(response.data && response.data.matches);
    } catch (e) {
        return true;
    }
}

