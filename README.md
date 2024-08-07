# Dex Scraper API

**Objective:** Build a scraping agent that can interact with DEX aggregators to retrieve and display trading data based on specified tokens.

## Overview

This project provides a scraping agent that interacts with DEX aggregators (specifically GeckoTerminal) to retrieve and display trading data based on specified tokens. The agent accepts two inputs (Input Token and Output Token) and identifies all available pairs on DEXes for the given tokens. It retrieves the last 1000 trades, including details of the traders.

## Features

- Accepts two input tokens to search for trading pairs.
- Retrieves trading data from GeckoTerminal.
- Collects and displays the last 1000 trades, including trader details.

## Prerequisites

- Node.js (v14.x or later)
- npm (v6.x or later)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/trade-scraping-api.git
   cd trade-scraping-api
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

## Configuration

Ensure you have the following dependencies installed in your `package.json`:
```json
"devDependencies": {
  "@babel/preset-env": "^7.14.2",
  "babel-jest": "^27.0.2",
  "jest": "^27.0.2",
  "axios": "^0.21.1",
  "puppeteer-extra": "^3.1.18",
  "puppeteer-extra-plugin-stealth": "^2.7.7"
}
```

Also, ensure your `babel.config.cjs` and `jest.config.cjs` files are properly configured:
- **babel.config.cjs**
  ```javascript
  module.exports = {
    presets: ['@babel/preset-env'],
  };
  ```
- **jest.config.cjs**
  ```javascript
  module.exports = {
    transform: {
      '^.+\\.js$': 'babel-jest',
    },
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  };
  ```

## Usage

1. Run the main scraping agent:
   ```bash
   node src/index.js
   ```

2. The agent will output the trading data to the console and save it to a JSON file in the `data` directory.

## Code Structure

- `src/index.js`: The main scraping agent code.
- `test/main.test.js`: Unit tests for the scraping functions.
- `babel.config.cjs`: Babel configuration file.
- `jest.config.cjs`: Jest configuration file.

## Function Descriptions and Assumptions

### `fetchDexScreenerData`

This function fetches data from the DexScreener API based on input and output tokens and prints specified information.

**Assumptions:**
- We assume that the API will return pairs data sorted by liquidity.
- Only the top 3 pools based on liquidity are selected.

```javascript
export async function fetchDexScreenerData(inputToken, outputToken) {
  const query = `${inputToken}%20${outputToken}`;
  const url = `https://api.dexscreener.com/latest/dex/search/?q=${query}`;

  try {
    const response = await axios.get(url);
    const data = response.data.pairs;

    const topPairs = data.sort((a, b) => b.liquidity.usd - a.liquidity.usd).slice(0, 3);
    const result = [];

    for (const pair of topPairs) {
      console.log('Base Token:', pair.baseToken.name);
      console.log('Chain ID:', pair.chainId);
      console.log('Pair Address:', pair.pairAddress);
      console.log('Base Token Address:', pair.baseToken.address);
      console.log('Liquidity (USD):', pair.liquidity.usd);
      console.log('---------------------------------------');

      const geckoData = await fetchGeckoTerminalData(pair.chainId, pair.baseToken.address);
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
    console.error('Error fetching data from DexScreener API:', error);
  }
}
```

### `fetchGeckoTerminalData`

This function fetches data from the GeckoTerminal API based on network and token address.

**Assumptions:**
- We assume the API will return pool data sorted by liquidity.
- Only the top 3 pools based on liquidity are selected.

```javascript
export async function fetchGeckoTerminalData(chainId, tokenAddress) {
  const network = chainId === 'ethereum' ? 'eth' : chainId;
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}/pools`;

  try {
    const response = await axios.get(url);
    const data = response.data.data;

    const topPools = data.sort((a, b) => b.attributes.reserve_in_usd - a.attributes.reserve_in_usd).slice(0, 3);
    const result = [];

    for (const pool of topPools) {
      console.log('Pool Address:', pool.attributes.address);
      console.log('Network:', network);
      console.log('Liquidity (USD):', pool.attributes.reserve_in_usd);
      console.log('Dex Information:', pool.relationships.dex);
      console.log('---------------------------------------');

      const transactions = await scrapeGeckoTerminal(network, pool.attributes.address);
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
    console.error('Error fetching data from GeckoTerminal API:', error);
  }
}
```

### `scrapeGeckoTerminal`

This function scrapes trading data from GeckoTerminal for a specific pool address and network. It collects the last 1000 trades and returns them in a structured format.

**Assumptions:**
- The function scrolls the page until it collects 100 unique transactions.
- Transactions are added until the set limit of 100 unique transactions is reached.

```javascript
export async function scrapeGeckoTerminal(network, poolAddress) {
  const url = `https://www.geckoterminal.com/${network}/pools/${poolAddress}`;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, { waitUntil: "networkidle2" });
    console.log("Page loaded:", url);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function scrollAndCollectTransactions() {
      let transactions = [];
      let transactionSet = new Set();
      let transactionCount = 0;
      const maxTransactions = 100;

      while (transactionCount < maxTransactions) {
        const newTransactions = await page.evaluate(() => {
          const rows = Array.from(
            document.querySelectorAll("table.absolute tbody tr")
          );
          return rows.map((row) => {
            const cells = row.querySelectorAll("td");
            const links = row.querySelectorAll("a");
            return {
              time: cells[0].textContent.trim(),
              trader: cells[1].textContent.trim(),
              priceInFirstToken: cells[2].textContent
                .trim()
                .split(/(?<=[0-9])(?=[A-Za-z])/)[0],
              priceInUsd: cells[3].textContent
                .trim()
                .split(/(?<=[0-9])(?=[A-Za-z])/)[0],
              amount: cells[4].textContent.trim(),
              value: cells[5].textContent
                .trim()
                .split(/(?<=[0-9])(?=[A-Za-z])/)[0],
              fromLink: links[0].href,
              transactionLink: links[1].href,
            };
          });
        });

        newTransactions.forEach((transaction, index) => {
          const transactionIndex = transactionCount + index + 1;
          console.log(`Row ${transactionIndex}:`, transaction);

          if (
            transaction &&
            !transactionSet.has(transaction.transactionLink)
          ) {
            transactionSet.add(transaction.transactionLink);
            transactions.push(transaction);
            transactionCount++;
            console.log(
              `Added transaction ${transactions.length}:`,
              transaction
            );
          }
        });

        if (transactionCount >= maxTransactions) break;

        // Scroll down
        await page.evaluate("window.scrollBy(0, window.innerHeight)");
        await wait(2000); // Wait for rows to load
      }

      console.log("Finished scrolling and collecting transactions");
      return transactions.slice(0, maxTransactions);
    }

    const transactions = await scrollAndCollectTransactions();

    const parsedTransactions = transactions.map((transaction) => {
      transaction.time = transaction.time.replace(
        /(\w+ \d+)(\d{2}:\d{2}:\d{2} [APM]{2})/,
        "$1 $2"
      );
      transaction.trader = transaction.trader.replace(
        /(Sell|Buy)(\d

+m \d+s)/,
        "$1 $2"
      );
      return transaction;
    });

    parsedTransactions.sort((a, b) => new Date(b.time) - new Date(a.time));

    console.log(`Total transactions collected: ${parsedTransactions.length}`);
    console.log("Sample of transactions:", parsedTransactions.slice(0, 5));

    await browser.close();
    return parsedTransactions;
  } catch (error) {
    console.error("Error scraping GeckoTerminal:", error);
  }
}
```

## Running Tests

1. To run the unit tests, use the following command:
   ```bash
   npm test
   ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License.
```