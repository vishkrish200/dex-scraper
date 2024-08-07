import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import axios from "axios";
import path from "path";

//Very important, this is used to avoid a site's anit-bot measures
puppeteer.use(StealthPlugin());

/**
 * Fetches data from DexScreener API based on input and output tokens and prints specified information.
 * @param {string} inputToken - The input token.
 * @param {string} outputToken - The output token.
 */
export async function fetchDexScreenerData(inputToken, outputToken) {
  const query = `${inputToken}%20${outputToken}`;
  const url = `https://api.dexscreener.com/latest/dex/search/?q=${query}`;

  try {
    const response = await axios.get(url);
    const data = response.data.pairs;

    const topPairs = data
      .sort((a, b) => b.liquidity.usd - a.liquidity.usd)
      .slice(0, 3);
    const result = [];

    for (const pair of topPairs) {
      console.log("Base Token:", pair.baseToken.name);
      console.log("Chain ID:", pair.chainId);
      console.log("Pair Address:", pair.pairAddress);
      console.log("Base Token Address:", pair.baseToken.address);
      console.log("Liquidity (USD):", pair.liquidity.usd);
      console.log("---------------------------------------");

      const geckoData = await fetchGeckoTerminalData(
        pair.chainId,
        pair.baseToken.address
      );
      result.push({
        baseToken: pair.baseToken.name,
        chainId: pair.chainId,
        pairAddress: pair.pairAddress,
        baseTokenAddress: pair.baseToken.address,
        liquidity: pair.liquidity.usd,
        geckoData: geckoData,
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching data from DexScreener API:", error);
  }
}

/**
 * Fetches data from GeckoTerminal API based on network and token address.
 * @param {string} chainId - The chain ID.
 * @param {string} tokenAddress - The base token address.
 */
export async function fetchGeckoTerminalData(chainId, tokenAddress) {
  const network = chainId === "ethereum" ? "eth" : chainId;
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}/pools`;

  try {
    const response = await axios.get(url);
    const data = response.data.data;

    const topPools = data
      .sort((a, b) => b.attributes.reserve_in_usd - a.attributes.reserve_in_usd)
      .slice(0, 3);
    const result = [];
    // let flag = false;
    for (const pool of topPools) {
      console.log("Pool Address:", pool.attributes.address);
      console.log("Network:", network);
      console.log("Liquidity (USD):", pool.attributes.reserve_in_usd);
      console.log("Dex Information:", pool.relationships.dex);
      console.log("---------------------------------------");

      const transactions = await scrapeGeckoTerminal(
        network,
        pool.attributes.address
      );
      result.push({
        poolAddress: pool.attributes.address,
        network: network,
        liquidity: pool.attributes.reserve_in_usd,
        dex: pool.relationships.dex,
        transactions: transactions,
      });
    }

    return result;
  } catch (error) {
    console.error("Error fetching data from GeckoTerminal API:", error);
  }
}

/**
 * Scrapes transaction data from GeckoTerminal for a specific pool.
 * @param {string} network - The network.
 * @param {string} poolAddress - The pool address.
 */
export async function scrapeGeckoTerminal(network, poolAddress) {
  const url = `https://www.geckoterminal.com/${network}/pools/${poolAddress}`;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, { waitUntil: "networkidle2" });
    // console.log("Page loaded:", url);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function scrollAndCollectTransactions() {
      let transactions = [];
      let transactionSet = new Set();
      let retries = 0;
      const maxRetries = 5; // Define maximum retries

      const { tableBodyBox, tableHeaderHeight, tableRowHeight } =
        await page.evaluate(() => {
          const tableBody = document.querySelector("table.absolute tbody");
          const tableHeader = document.querySelector("table.absolute thead");
          const firstRow = document.querySelector("table.absolute tbody tr");
          const { x, y, width, height } = tableBody.getBoundingClientRect();
          const headerHeight = tableHeader ? tableHeader.clientHeight : 0;
          const rowHeight = firstRow ? firstRow.clientHeight : 0;
          return {
            tableBodyBox: { x, y, width, height },
            tableHeaderHeight: headerHeight,
            tableRowHeight: rowHeight,
          };
        });

      await page.mouse.move(
        tableBodyBox.x + tableBodyBox.width / 2,
        tableBodyBox.y + tableBodyBox.height / 2
      );
      await page.mouse.wheel({ deltaY: tableHeaderHeight });
      await wait(2000);

      let i = 0;
      for (i = 0; transactions.length < 100 && retries < maxRetries; i++) {
        const newTransaction = await page.evaluate(() => {
          const row = document.querySelector("table.absolute tbody tr");
          if (!row) return null;

          const cells = row.querySelectorAll("td");
          const links = row.querySelectorAll("a");

          return {
            time: cells[0].textContent.trim(),
            action: cells[1].textContent.trim().replace(/(Sell|Buy).*/, "$1"),
            priceInUsd: cells[3].textContent.trim().split("$").pop(),
            amountOfInputToken: cells[4].textContent.trim(),
            valueInUsd: cells[5].textContent.trim().split("$").pop(),
            fromLink: links[0].href,
            transactionLink: links[1].href,
          };
        });

        // console.log(`Row ${i + 1}:`, newTransaction);

        if (
          newTransaction &&
          !transactionSet.has(newTransaction.transactionLink)
        ) {
          transactionSet.add(newTransaction.transactionLink);
          transactions.push(newTransaction);
          // console.log(
          //   `Added transaction ${transactions.length}:`,
          //   newTransaction
          // );
          retries = 0; // Reset retries after a successful transaction
        } else {
          retries++;
          if (retries >= maxRetries) {
            // console.log(`Max retries reached (${maxRetries}), stopping.`);
            break;
          }
          // console.log(
          //   `Row ${
          //     i + 1
          //   } not fully loaded, retrying... (${retries}/${maxRetries})`
          // );
        }

        await page.mouse.move(
          tableBodyBox.x + tableBodyBox.width / 2,
          tableBodyBox.y + tableBodyBox.height / 2
        );
        await page.mouse.wheel({ deltaY: tableRowHeight });

        if ((i + 1) % 6 === 0) {
          // console.log(`Waiting for 1.5 seconds after ${i + 1} rows`);
          await wait(1500);
        } else {
          await wait(1000);
        }

        const rowLoaded = await page.evaluate(() => {
          const row = document.querySelector("table.absolute tbody tr");
          return row && row.querySelectorAll("td").length > 0;
        });

        if (!rowLoaded) {
          // console.log(`Row ${i + 1} not fully loaded, retrying...`);
          i--;
          await wait(2000);
        }
      }

      // console.log("went through ", i, " rows");
      // console.log("Finished scrolling and collecting transactions");
      return transactions.slice(0, 100);
    }

    const transactions = await scrollAndCollectTransactions();

    const parsedTransactions = transactions.map((transaction) => {
      transaction.time = transaction.time.replace(
        /(\w+ \d+)(\d{2}:\d{2}:\d{2} [APM]{2})/,
        "$1 $2"
      );
      transaction.action = transaction.action.replace(/(Sell|Buy).*/, "$1");
      return transaction;
    });

    parsedTransactions.sort((a, b) => new Date(b.time) - new Date(a.time));

    // console.log(`Total transactions collected: ${parsedTransactions.length}`);

    await browser.close();
    return parsedTransactions;
  } catch (error) {
    console.error("Error scraping GeckoTerminal:", error);
    return []; // Return an empty array in case of error
  }
}

/**
 * Main function that fetches data from DexScreener API for a given input and output token,
 * processes the data, and saves the results in JSON files.
 */
export async function main() {
  const inputToken = "PEPE";
  const outputToken = "WETH";
  const dexData = await fetchDexScreenerData(inputToken, outputToken);

  if (!dexData) {
    console.error("Failed to fetch data from DexScreener");
    return;
  }

  //creating a directory to store the output
  const outputDir = "./data";
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  //categorising and storing each paor
  dexData.forEach((pair) => {
    const pairDir = path.join(outputDir, `${pair.baseToken}_${pair.chainId}`);
    if (!fs.existsSync(pairDir)) {
      fs.mkdirSync(pairDir);
    }

    pair.geckoData.forEach((pool, index) => {
      const filePath = path.join(pairDir, `pool_${index + 1}.json`);
      const poolData = {
        poolAddress: pool.poolAddress,
        network: pool.network,
        liquidity: pool.liquidity,
        dex: pool.dex,
        transactions: pool.transactions,
      };

      fs.writeFileSync(filePath, JSON.stringify(poolData, null, 2));
      console.log(`Data saved to ${filePath}`);
    });
  });
}

// Call the main function
main();
