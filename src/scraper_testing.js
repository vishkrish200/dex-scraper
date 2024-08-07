import axios from "axios";

/**
 * Fetches data from DexScreener API based on input and output tokens and prints specified information.
 * @param {string} inputToken - The input token.
 * @param {string} outputToken - The output token.
 */
async function fetchDexScreenerData(inputToken, outputToken) {
  const query = `${inputToken}%20${outputToken}`;
  const url = `https://api.dexscreener.com/latest/dex/search/?q=${query}`;

  try {
    const response = await axios.get(url);
    const data = response.data.pairs;

    // Sort the pairs based on liquidity in descending order and take the top 3
    const topPairs = data
      .sort((a, b) => b.liquidity.usd - a.liquidity.usd)
      .slice(0, 3);

    for (const pair of topPairs) {
      console.log("Base Token:", pair.baseToken.name);
      console.log("Chain ID:", pair.chainId);
      console.log("Pair Address:", pair.pairAddress);
      console.log("Base Token Address:", pair.baseToken.address);
      console.log("Liquidity (USD):", pair.liquidity.usd);
      console.log("---------------------------------------");

      // Fetch and print additional information using the GeckoTerminal API
      await fetchGeckoTerminalData(pair.chainId, pair.baseToken.address);
    }
  } catch (error) {
    console.error("Error fetching data from DexScreener API:", error);
  }
}

/**
 * Fetches data from GeckoTerminal API based on network and token address.
 * @param {string} chainId - The chain ID.
 * @param {string} tokenAddress - The base token address.
 */
async function fetchGeckoTerminalData(chainId, tokenAddress) {
  const network = chainId === "ethereum" ? "eth" : chainId;
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}/pools`;

  try {
    const response = await axios.get(url);
    const data = response.data.data;

    // Sort the pools based on liquidity in descending order and take the top 3
    const topPools = data
      .sort((a, b) => b.attributes.reserve_in_usd - a.attributes.reserve_in_usd)
      .slice(0, 3);

    // Extract and print the required information from the top pools
    topPools.forEach((pool) => {
      console.log("Pool Address:", pool.attributes.address);
      console.log("Network:", network);
      console.log("Liquidity (USD):", pool.attributes.reserve_in_usd);
      console.log("Dex Information:", pool.relationships.dex);
      console.log("---------------------------------------");
    });
  } catch (error) {
    console.error("Error fetching data from GeckoTerminal API:", error);
  }
}

// Example usage
fetchDexScreenerData("PEPE", "WSOL");
