import axios from "axios";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import {
  fetchDexScreenerData,
  fetchGeckoTerminalData,
  scrapeGeckoTerminal,
  main,
} from "../src/index";

jest.mock("axios");
jest.mock("puppeteer-extra", () => {
  const actualPuppeteer = jest.requireActual("puppeteer-extra");
  actualPuppeteer.launch = jest.fn();
  return actualPuppeteer;
});
jest.mock("fs");
jest.mock("path");

puppeteer.use(StealthPlugin());

describe("fetchDexScreenerData", () => {
  it("should fetch and return sorted data from DexScreener API", async () => {
    const mockResponse = {
      data: {
        pairs: [
          {
            baseToken: { name: "TokenA", address: "0xTokenA" },
            chainId: "1",
            pairAddress: "0xPairA",
            liquidity: { usd: 1000 },
          },
          {
            baseToken: { name: "TokenB", address: "0xTokenB" },
            chainId: "1",
            pairAddress: "0xPairB",
            liquidity: { usd: 2000 },
          },
        ],
      },
    };
    axios.get.mockResolvedValueOnce(mockResponse);
    const result = await fetchDexScreenerData("PEPE", "WETH");
    expect(result).toHaveLength(2);
    expect(result[0].baseToken).toBe("TokenB");
    expect(result[1].baseToken).toBe("TokenA");
  });

  it("should handle error when fetching data from DexScreener API", async () => {
    axios.get.mockRejectedValueOnce(new Error("API error"));
    const result = await fetchDexScreenerData("PEPE", "WETH");
    expect(result).toBeUndefined();
  });
});

describe("fetchGeckoTerminalData", () => {
  it("should fetch and return sorted data from GeckoTerminal API", async () => {
    const mockResponse = {
      data: {
        data: [
          {
            attributes: { address: "0xPoolA", reserve_in_usd: 1000 },
            relationships: { dex: { data: "DexA" } },
          },
          {
            attributes: { address: "0xPoolB", reserve_in_usd: 2000 },
            relationships: { dex: { data: "DexB" } },
          },
        ],
      },
    };
    axios.get.mockResolvedValueOnce(mockResponse);
    const result = await fetchGeckoTerminalData("1", "0xTokenA");
    expect(result).toHaveLength(2);
    expect(result[0].poolAddress).toBe("0xPoolB");
    expect(result[1].poolAddress).toBe("0xPoolA");
  });

  it("should handle error when fetching data from GeckoTerminal API", async () => {
    axios.get.mockRejectedValueOnce(new Error("API error"));
    const result = await fetchGeckoTerminalData("1", "0xTokenA");
    expect(result).toBeUndefined();
  });
});

describe("scrapeGeckoTerminal", () => {
  let browser;
  let page;

  beforeEach(() => {
    page = {
      setViewport: jest.fn(),
      goto: jest.fn(),
      evaluate: jest.fn(),
      mouse: { move: jest.fn(), wheel: jest.fn() },
      close: jest.fn(),
    };
    browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
    };
    puppeteer.launch.mockResolvedValue(browser);
  });

  it("should scrape and return transaction data from GeckoTerminal", async () => {
    const mockTransactions = [
      {
        time: "2023-08-01 12:00:00",
        action: "Buy",
        priceInUsd: "10",
        amountOfInputToken: "100",
        valueInUsd: "1000",
        fromLink: "linkA",
        transactionLink: "txA",
      },
    ];
    page.evaluate
      .mockResolvedValueOnce({
        tableBodyBox: { x: 0, y: 0, width: 100, height: 100 },
        tableHeaderHeight: 20,
        tableRowHeight: 10,
      })
      .mockResolvedValue(mockTransactions[0]);
    const result = await scrapeGeckoTerminal("eth", "0xPoolA");
    expect(result).toHaveLength(1);
    expect(result[0].transactionLink).toBe("txA");
  }, 10000); // Increase the timeout to 10 seconds for this test

  it("should handle error when scraping data from GeckoTerminal", async () => {
    puppeteer.launch.mockRejectedValueOnce(new Error("Scraping error"));
    const result = await scrapeGeckoTerminal("eth", "0xPoolA");
    expect(result).toEqual([]);
  });
});

describe("main", () => {
  let fetchDexScreenerDataMock;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    fetchDexScreenerDataMock = jest.spyOn(
      require("../src/index"),
      "fetchDexScreenerData"
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should fetch data, process it, and save results in JSON files", async () => {
    const mockDexData = [
      {
        baseToken: "TokenA",
        chainId: "1",
        pairAddress: "0xPairA",
        baseTokenAddress: "0xTokenA",
        liquidity: 1000,
        geckoData: [
          {
            poolAddress: "0xPoolA",
            network: "eth",
            liquidity: 1000,
            dex: "DexA",
            transactions: [{ transactionLink: "txA" }],
          },
        ],
      },
    ];

    fetchDexScreenerDataMock.mockResolvedValueOnce(mockDexData);

    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation();
    fs.writeFileSync.mockImplementation();

    console.log("Before calling main");
    await main();
    console.log("After calling main");

    expect(fetchDexScreenerDataMock).toHaveBeenCalledWith("PEPE", "WETH");
    expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("TokenA_1/pool_1.json"),
      expect.any(String)
    );
  });

  it("should handle failure to fetch data from DexScreener", async () => {
    fetchDexScreenerDataMock.mockResolvedValueOnce(undefined);

    console.log("Before calling main with failure");
    await main();
    console.log("After calling main with failure");

    expect(fetchDexScreenerDataMock).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to fetch data from DexScreener"
    );
  });
});
