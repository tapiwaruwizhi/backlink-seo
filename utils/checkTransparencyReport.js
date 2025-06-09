import axios from "axios";

export async function checkTransparencyReport(domain) {
  try {
    const url = `https://transparencyreport.google.com/safe-browsing/search?url=${domain}`;
    const res = await axios.get(url, { timeout: 10000 });
    if (res.data.includes("No available data")) {
      return false;
    }
    return true;
  } catch {
    return true; // assume safe on error
  }
}