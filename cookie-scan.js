import puppeteer from "puppeteer";
import fetch from "node-fetch";

const SHEETS_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxBJViFKk3H8CGBhHdVyaUk2EYMICPNO6L_DhwbSkqsZ-IXr8nbeE7QFoFxIdkxchB8/exec";

const DOMAINS = [
  "https://www.addingvalue.se",
  "https://www.adding-value.de",
  "https://www.adding-value.es",
  "https://www.addingvalue.nl",
  "https://www.addingvalue.fr",
  "https://www.addingvalue.dk",
  "https://www.addingvalue.no",
  "https://www.addingvalue.nu",
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanDomainCookies(domain) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const client = await page.target().createCDPSession();

  const setCookieLogs = [];

  // Tangkap Set-Cookie dari semua response header
  page.on("response", async (res) => {
    try {
      const headers = res.headers();
      if (headers["set-cookie"]) {
        console.log(`[${domain}] 🍪 Set-Cookie from ${res.url()}`);
        console.log(headers["set-cookie"]);

        setCookieLogs.push({
          url: res.url(),
          setCookie: headers["set-cookie"],
        });
      }
    } catch (err) {
      // abaikan error response
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  await page.goto(domain, { waitUntil: "load", timeout: 0 });

  try {
    await page.waitForSelector("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", {
      timeout: 5000,
    });
    await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
    console.log("✅ Consent clicked on", domain);
  } catch {
    console.log("⚠️ No consent banner on", domain);
  }

  // Tunggu agar semua third-party script jalan
  await delay(25000);

  const result = await client.send("Network.getAllCookies");

  await browser.close();

  return {
    domain,
    timestamp: new Date().toISOString(),
    cookies: result.cookies,
    setCookieLogs, // <-- tambahkan ini
  };
}

async function main() {
  for (const domain of DOMAINS) {
    try {
      const payload = await scanDomainCookies(domain);
      console.log(`Cookies from ${domain}:`, payload.cookies);
      console.log(`Set-Cookie logs from ${domain}:`, payload.setCookieLogs);

      const res = await fetch(SHEETS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log(`✅ Sent cookies from ${domain}:`, text);
    } catch (err) {
      console.error(`❌ Failed to scan ${domain}:`, err.message);
    }
  }
}

main();
