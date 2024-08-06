import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: true }); // Set to false for debugging
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });

  await page.goto(
    "https://www.geckoterminal.com/eth/pools/0xa43fe16908251ee70ef74718545e4fe6c5ccec9f",
    { waitUntil: "networkidle2" }
  );
  console.log("Page loaded");

  // Function to wait for a specified time
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Function to scroll within the table and collect transactions
  async function scrollAndCollectTransactions() {
    let transactions = [];
    let transactionSet = new Set();

    // Get the bounding box of the table body and the first row to calculate scroll heights
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

    // Special initial scroll for the table header height
    await page.mouse.move(
      tableBodyBox.x + tableBodyBox.width / 2,
      tableBodyBox.y + tableBodyBox.height / 2
    );
    await page.mouse.wheel({ deltaY: tableHeaderHeight });
    await wait(2000); // Wait for the header scroll to complete

    // Scroll and collect data for 100 rows
    for (let i = 0; i < 100; i++) {
      // Collect transaction data from the first row
      const newTransaction = await page.evaluate(() => {
        const row = document.querySelector("table.absolute tbody tr");
        if (!row) return null;

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
          value: cells[5].textContent.trim().split(/(?<=[0-9])(?=[A-Za-z])/)[0],
          transactionLink: links[0].href,
          fromLink: links[1].href,
        };
      });

      // Log the new row data
      console.log(`Row ${i + 1}:`, newTransaction);

      // Check if the transaction is unique and add to the list
      if (
        newTransaction &&
        !transactionSet.has(newTransaction.transactionLink)
      ) {
        transactionSet.add(newTransaction.transactionLink);
        transactions.push(newTransaction);
        console.log(
          `Added transaction ${transactions.length}:`,
          newTransaction
        );
      }

      // Scroll down by the height of one row
      await page.mouse.move(
        tableBodyBox.x + tableBodyBox.width / 2,
        tableBodyBox.y + tableBodyBox.height / 2
      );
      await page.mouse.wheel({ deltaY: tableRowHeight });

      // Wait for 2 seconds after every 6 rows
      if ((i + 1) % 6 === 0) {
        console.log(`Waiting for 2 seconds after ${i + 1} rows`);
        await wait(2000);
      } else {
        await wait(1000); // Wait for the next row to load
      }

      // Ensure the row is fully loaded before moving to the next iteration
      const rowLoaded = await page.evaluate(() => {
        const row = document.querySelector("table.absolute tbody tr");
        return row && row.querySelectorAll("td").length > 0;
      });

      if (!rowLoaded) {
        console.log(`Row ${i + 1} not fully loaded, retrying...`);
        i--; // Retry the same row
        await wait(2000); // Wait for additional loading time
      }
    }

    console.log("Finished scrolling and collecting transactions");
    return transactions.slice(0, 100); // Ensure we return at most 100 transactions
  }

  // Scroll and collect transactions
  const transactions = await scrollAndCollectTransactions();

  // Parse and format transactions into structured data
  const parsedTransactions = transactions.map((transaction) => {
    transaction.time = transaction.time.replace(
      /(\w+ \d+)(\d{2}:\d{2}:\d{2} [APM]{2})/,
      "$1 $2"
    );
    transaction.trader = transaction.trader.replace(
      /(Sell|Buy)(\d+m \d+s)/,
      "$1 $2"
    );
    return transaction;
  });

  // Sort transactions in descending order of time
  parsedTransactions.sort((a, b) => new Date(b.time) - new Date(a.time));

  console.log(`Total transactions collected: ${parsedTransactions.length}`);
  console.log("Sample of transactions:", parsedTransactions.slice(0, 5));

  // Save transactions to a JSON file
  fs.writeFileSync(
    "transactions.json",
    JSON.stringify(parsedTransactions, null, 2)
  );

  console.log("Transactions saved to transactions.json");

  await browser.close();
})();
