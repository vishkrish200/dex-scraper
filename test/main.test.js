import {
  fetchDexScreenerData,
  fetchGeckoTerminalData,
  scrapeGeckoTerminal,
} from "../src/index.js";

jest.mock("axios");
jest.mock("puppeteer-extra");

describe("fetchDexScreenerData", () => {
  it("should fetch and sort data by liquidity", async () => {
    // Mock the API response
    axios.get.mockResolvedValue({
      data: {
        pairs: [
          {
            baseToken: { name: "Token1", address: "0x1" },
            chainId: "ethereum",
            pairAddress: "0x1",
            liquidity: { usd: 1000 },
          },
          {
            baseToken: { name: "Token2", address: "0x2" },
            chainId: "ethereum",
            pairAddress: "0x2",
            liquidity: { usd: 2000 },
          },
          {
            baseToken: { name: "Token3", address: "0x3" },
            chainId: "ethereum",
            pairAddress: "0x3",
            liquidity: { usd: 3000 },
          },
        ],
      },
    });

    const data = await fetchDexScreenerData("PEPE", "WETH");
    expect(data).toHaveLength(3);
    expect(data[0].baseToken).toBe("Token3");
  });
});

describe("fetchGeckoTerminalData", () => {
  it("should fetch and sort pools by liquidity", async () => {
    // Mock the API response
    axios.get.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { address: "0x1", reserve_in_usd: 1000 },
            relationships: { dex: "Dex1" },
          },
          {
            attributes: { address: "0x2", reserve_in_usd: 2000 },
            relationships: { dex: "Dex2" },
          },
          {
            attributes: { address: "0x3", reserve_in_usd: 3000 },
            relationships: { dex: "Dex3" },
          },
        ],
      },
    });

    const data = await fetchGeckoTerminalData("ethereum", "0x1");
    expect(data).toHaveLength(3);
    expect(data[0].poolAddress).toBe("0x3");
  });
});

describe("scrapeGeckoTerminal", () => {
  it("should scrape transaction data", async () => {
    // Mock Puppeteer
    puppeteer.launch.mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setViewport: jest.fn(),
        goto: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({
          tableBodyBox: { x: 0, y: 0, width: 100, height: 100 },
          tableHeaderHeight: 10,
          tableRowHeight: 10,
        }),
        mouse: { move: jest.fn(), wheel: jest.fn() },
      }),
      close: jest.fn(),
    });

    const data = await scrapeGeckoTerminal("eth", "0x1");
    expect(data).toBeDefined();
  });
});
