import puppeteer from "puppeteer";

async function scrapeTrades(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    // Wait for the content to load using XPath
    await page.waitForXPath(
      "/html/body/div[1]/div/main/div[2]/div[4]/div[1]/div/div[3]/div/div/div/div/div/table",
      { timeout: 60000 }
    );

    // Scrape the trade data
    const trades = await page.evaluate(() => {
      const table = document.evaluate(
        "/html/body/div[1]/div/main/div[2]/div[4]/div[1]/div/div[3]/div/div/div/div/div/table",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      if (!table) return [];

      const rows = table.querySelectorAll("tbody tr");
      return Array.from(rows, (row) => {
        const columns = row.querySelectorAll("td");
        return {
          time: columns[0].textContent.trim(),
          type: columns[1].textContent.trim(),
          price: columns[2].textContent.trim(),
          amount: columns[3].textContent.trim(),
          total: columns[4].textContent.trim(),
          maker: columns[5].querySelector("a")
            ? columns[5].querySelector("a").href.split("/").pop()
            : "N/A",
        };
      });
    });

    console.log(`Scraped ${trades.length} trades:`);
    console.log(trades);

    return trades;
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
}

// Usage
const url =
  "https://www.geckoterminal.com/eth/pools/0xa43fe16908251ee70ef74718545e4fe6c5ccec9f";
scrapeTrades(url);
