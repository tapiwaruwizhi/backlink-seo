import dns from "dns/promises";
import axios from "axios";

export async function isVerifiedDomain(domain) {
  const verified = {
    a_record: false,
    mx_record: false,
    txt_record: false,
    http_response: false,
    reverse_dns: false,
  };

  try {
    const aRecords = await dns.resolve(domain, "A");
    if (aRecords.length) verified.a_record = true;
  } catch {}

  try {
    const mxRecords = await dns.resolve(domain, "MX");
    if (mxRecords.length) verified.mx_record = true;
  } catch {}

  try {
    const txtRecords = await dns.resolve(domain, "TXT");
    if (txtRecords.length) verified.txt_record = true;
  } catch {}

  try {
    // HTTP GET
    const res = await axios.get(`http://${domain}`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    if (res.status < 400) verified.http_response = true;
  } catch {}

  try {
    const ips = await dns.resolve(domain, "A");
    if (ips.length > 0) {
      const revName = await dns.reverse(ips[0]);
      if (revName && revName.length > 0) verified.reverse_dns = true;
    }
  } catch {}

  return verified;
}

