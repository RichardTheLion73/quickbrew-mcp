# Quickbrew MCP Server

An official [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Quickbrew.io](https://quickbrew.io).

Gives Claude Desktop, Cursor, and autonomous AI agents direct access to Quickbrew web scraping, content condensing, and sentiment analysis tools using **x402 micro-payments on Base**.

## Installation & Setup

Add `quickbrew` to your `claude_desktop_config.json` (or Cursor MCP settings):

```json
{
  "mcpServers": {
    "quickbrew": {
      "command": "npx",
      "args": ["-y", "@richardthelion73/quickbrew-mcp"],
      "env": {
        "QUICKBREW_PRIVATE_KEY": "YOUR_BASE_WALLET_PRIVATE_KEY"
      }
    }
  }
}
Security Note: Your private key stays local on your machine and is never sent to Anthropic or Quickbrew. It is used locally by this MCP server to sign EIP-712 USDC payment authorizations on the Base network.

Available Tools
quickbrew_condense: Summarizes long web content into concise, structured bullet points ($0.005 USDC).

quickbrew_scrape: Converts any public URL into clean, token-efficient Markdown ($0.001 USDC).

quickbrew_sentiment: Extracts webpage brand tone, target audience, and key pitch hooks ($0.002 USDC).

quickbrew_stats: Fetches total agents served and cumulative platform usage metrics (Free).

License
MIT


---

### Step-by-Step Check Before Publishing

1. **`quickbrew-mcp/README.md`** → Saved with the text above.
2. **`quickbrew-mcp/package.json`** → Set to:
```json
{
  "name": "@richardthelion73/quickbrew-mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "quickbrew-mcp": "index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "ethers": "^6.0.0",
    "node-fetch": "^3.0.0"
  }
}