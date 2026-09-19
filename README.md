# BodineDirect BigCommerce MCP

Read-only remote MCP server for the BodineDirect BigCommerce catalog.

Endpoints: `/`, `/test-bigcommerce`, and Streamable HTTP `/mcp`.

Tools: `search_products`, `get_product`, `get_product_by_sku`, `get_product_custom_fields`, `get_product_variants`, `get_categories`, `get_brands`, `get_inventory`.

Production secrets stay in Cloudflare. Never commit credentials to GitHub. The Wrangler name intentionally targets the existing `nameless-river-98ff` Worker.

## Install / deploy
`npm install`
`npm run deploy`

## Security
The first package establishes the read-only MCP layer. Add authentication/access control before treating the public `/mcp` endpoint as production-ready.
