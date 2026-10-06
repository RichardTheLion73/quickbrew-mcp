#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import fetch from "node-fetch";

const API_BASE = "https://api.quickbrew.io";
const PRIVATE_KEY = process.env.QUICKBREW_PRIVATE_KEY || ""; // Optional: Agent wallet for auto-payments

// Helper: Make HTTP request to Quickbrew API, handling x402 payment challenge automatically if funded
async function callQuickbrewWithPayment(endpoint, params = {}) {
  const urlObj = new URL(`${API_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    urlObj.searchParams.append(key, value);
  }

  // 1. Initial request to get data or 402 challenge
  let response = await fetch(urlObj.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  // If not 402, return response directly (e.g. /stats or free endpoints)
  if (response.status !== 402) {
    const data = await response.json();
    return data;
  }

  // 2. Handle 402 Payment Required
  const paymentRequiredHeader = response.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("Endpoint returned 402 Payment Required but missing PAYMENT-REQUIRED header.");
  }

  if (!PRIVATE_KEY) {
    const challengeJson = JSON.parse(atob(paymentRequiredHeader));
    return {
      error: "Payment Required",
      message: `This endpoint costs ${challengeJson.maxAmountRequired} atomic units of USDC on Base. Set QUICKBREW_PRIVATE_KEY in your MCP environment to enable autonomous agent payments.`,
      challenge: challengeJson
    };
  }

  // 3. Autonomous x402 Payment Signing via EIP-3009
  try {
    const challenge = JSON.parse(atob(paymentRequiredHeader));
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiry

    // EIP-3009 TransferWithAuthorization Typed Data
    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: 8453, // Base Mainnet
      verifyingContract: challenge.asset
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" }
      ]
    };

    const value = {
      from: wallet.address,
      to: challenge.payTo,
      value: challenge.maxAmountRequired,
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce
    };

    const signature = await wallet.signTypedData(domain, types, value);
    const sigBytes = ethers.Signature.from(signature);

    const paymentPayload = {
      x402Version: 2,
      from: wallet.address,
      to: challenge.payTo,
      value: challenge.maxAmountRequired,
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce,
      v: sigBytes.v,
      r: sigBytes.r,
      s: sigBytes.s,
      signature: signature
    };

    const paymentSignatureHeader = btoa(JSON.stringify(paymentPayload));

    // Retry request with payment header
    const paidResponse = await fetch(urlObj.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "PAYMENT-SIGNATURE": paymentSignatureHeader
      }
    });

    return await paidResponse.json();
  } catch (err) {
    throw new Error(`Failed to sign x402 payment: ${err.message}`);
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: "quickbrew-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "quickbrew_scrape",
        description: "Scrapes any public URL and converts the HTML into clean, token-efficient Markdown ($0.001 USDC).",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The full target URL to scrape (e.g., https://docs.base.org)" }
          },
          required: ["url"]
        }
      },
      {
        name: "quickbrew_condense",
        description: "Scrapes a URL and uses AI to extract core facts, statistics, and main points into concise bullet points ($0.005 USDC).",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The full target URL to condense." }
          },
          required: ["url"]
        }
      },
      {
        name: "quickbrew_sentiment",
        description: "Analyzes the live sentiment of any webpage text via AI sentiment classification ($0.002 USDC).",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The full target URL to analyze." }
          },
          required: ["url"]
        }
      },
      {
        name: "quickbrew_stats",
        description: "Fetches live platform metrics including total agents served and cumulative USDC revenue volume (Free).",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "quickbrew_stats") {
      const data = await callQuickbrewWithPayment("/stats");
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "quickbrew_scrape") {
      if (!args?.url) throw new Error("Missing 'url' parameter.");
      const data = await callQuickbrewWithPayment("/api/v1/scrape", { url: args.url });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "quickbrew_condense") {
      if (!args?.url) throw new Error("Missing 'url' parameter.");
      const data = await callQuickbrewWithPayment("/api/v1/condense", { url: args.url });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "quickbrew_sentiment") {
      if (!args?.url) throw new Error("Missing 'url' parameter.");
      const data = await callQuickbrewWithPayment("/api/v1/sentiment", { url: args.url });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message }, null, 2) }]
    };
  }
});

// Start Server via Stdio Transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Quickbrew MCP Server running on stdio");