import axios from "axios";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

dotenv.config();

async function fetchTopPairs(inputToken, outputToken) {
  const query = `${inputToken}%2F${outputToken}`;
  const url = `https://api.dexscreener.com/latest/dex/search/?q=${query}`;
  console.log(`Fetching pairs from URL: ${url}`);

  try {
    const response = await axios.get(url);
    console.log(
      `Fetched pairs data: ${JSON.stringify(response.data, null, 2)}`
    );

    const pairs = response.data.pairs
      .sort((a, b) => b.liquidity.usd - a.liquidity.usd)
      .slice(0, 3)
      .map((pair) => ({
        address: pair.pairAddress,
        baseToken: pair.baseToken.symbol,
        quoteToken: pair.quoteToken.symbol,
        liquidityUsd: pair.liquidity.usd,
        url: pair.url,
      }));
    console.log(`Top 3 pairs: ${JSON.stringify(pairs, null, 2)}`);
    return pairs;
  } catch (error) {
    console.error(`Error fetching pairs: ${error}`);
    return [];
  }
}

async function fetchTrades(pairUrl) {
  try {
    console.log(`Fetching trades from URL: ${pairUrl}`);
    const { data } = await axios.get(pairUrl);
    const $ = cheerio.load(data);
    const trades = [];

    // Update the selector to match the structure of your HTML
    $(
      "#__next .some-wrapper-class .some-inner-wrapper-class .specific-table-class tbody tr"
    ).each((_, element) => {
      const trade = {
        timestamp:
          $(element).find("td:nth-child(1) time").attr("datetime") ?? "",
        price: parseFloat(
          $(element)
            .find("td:nth-child(2)")
            .text()
            .replace("$", "")
            .replace(",", "")
        ),
        amount: parseFloat(
          $(element).find("td:nth-child(3)").text().replace(/,/g, "")
        ),
        total: parseFloat(
          $(element)
            .find("td:nth-child(4)")
            .text()
            .replace("$", "")
            .replace(",", "")
        ),
        makerSide: $(element).find("td:nth-child(5)").text(),
      };

      trades.push(trade);
    });

    return trades;
  } catch (error) {
    console.error("Error fetching trades:", error);
    return [];
  }
}

async function main() {
  const inputToken = process.argv[2] || "PEPE";
  const outputToken = process.argv[3] || "WETH";
  console.log(`Input Token: ${inputToken}, Output Token: ${outputToken}`);

  const pairs = await fetchTopPairs(inputToken, outputToken);

  for (const pair of pairs) {
    console.log(
      `Fetching trades for pair ${pair.baseToken}/${pair.quoteToken} with address ${pair.address}`
    );
    const trades = await fetchTrades(
      "https://www.geckoterminal.com/eth/pools/0xa43fe16908251ee70ef74718545e4fe6c5ccec9f"
    );
    if (trades.length > 0) {
      console.log(`Last 1000 trades for ${pair.baseToken}/${pair.quoteToken}:`);
      console.table(trades);
    } else {
      console.error("Failed to retrieve trades data.");
    }
  }
}

main();
