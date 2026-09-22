import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

interface Env {
  BIGCOMMERCE_STORE_HASH: string;
  BIGCOMMERCE_ACCESS_TOKEN: string;
  BIGCOMMERCE_CLIENT_ID?: string;
  BIGCOMMERCE_CLIENT_SECRET?: string;
}

const jsonText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

async function bcFetch(env: Env, path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`https://api.bigcommerce.com/stores/${env.BIGCOMMERCE_STORE_HASH}/v3${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { "X-Auth-Token": env.BIGCOMMERCE_ACCESS_TOKEN, "Accept": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`BigCommerce API ${response.status}: ${JSON.stringify(body)}`);
  return body as any;
}

function makeServer(env: Env) {
  const server = new McpServer({ name: "BodineDirect BigCommerce", version: "1.0.0" });

  server.registerTool("search_products", {
    description: "Search the BodineDirect catalog by product name or SKU. Read-only.",
    inputSchema: {
      query: z.string().min(1).describe("Product name, model number, or SKU"),
      limit: z.number().int().min(1).max(50).default(10),
    },
  }, async ({ query, limit }) => {
    const [bySku, byName] = await Promise.all([
      bcFetch(env, "/catalog/products", { sku: query, limit }),
      bcFetch(env, "/catalog/products", { name: query, limit }),
    ]);
    const merged = new Map<number, any>();
    for (const p of [...(bySku.data ?? []), ...(byName.data ?? [])]) merged.set(p.id, p);
    return jsonText({ data: [...merged.values()].slice(0, limit) });
  });

  server.registerTool("get_product", {
    description: "Get one product by numeric BigCommerce product ID. Read-only.",
    inputSchema: { productId: z.number().int().positive() },
  }, async ({ productId }) => jsonText(await bcFetch(env, `/catalog/products/${productId}`)));

  server.registerTool("get_product_by_sku", {
    description: "Look up BodineDirect products by exact SKU/model number. Read-only.",
    inputSchema: { sku: z.string().min(1) },
  }, async ({ sku }) => jsonText(await bcFetch(env, "/catalog/products", { sku, limit: 50 })));

  server.registerTool("get_product_custom_fields", {
    description: "Get custom fields/specifications for a product. Useful for the BodineDirect finder. Read-only.",
    inputSchema: { productId: z.number().int().positive() },
  }, async ({ productId }) => jsonText(await bcFetch(env, `/catalog/products/${productId}/custom-fields`, { limit: 250 })));

  server.registerTool("get_product_variants", {
    description: "Get variants for a product, including variant SKU and option data. Read-only.",
    inputSchema: { productId: z.number().int().positive() },
  }, async ({ productId }) => jsonText(await bcFetch(env, `/catalog/products/${productId}/variants`, { limit: 250 })));

  server.registerTool("get_categories", {
    description: "List or search BigCommerce product categories. Read-only.",
    inputSchema: { name: z.string().optional(), limit: z.number().int().min(1).max(250).default(50) },
  }, async ({ name, limit }) => jsonText(await bcFetch(env, "/catalog/categories", { name, limit })));

  server.registerTool("get_brands", {
    description: "List or search brands in the BodineDirect catalog. Read-only.",
    inputSchema: { name: z.string().optional(), limit: z.number().int().min(1).max(250).default(50) },
  }, async ({ name, limit }) => jsonText(await bcFetch(env, "/catalog/brands", { name, limit })));

  server.registerTool("get_inventory", {
    description: "Inspect product and variant inventory fields for a product. Read-only.",
    inputSchema: { productId: z.number().int().positive() },
  }, async ({ productId }) => {
    const [product, variants] = await Promise.all([
      bcFetch(env, `/catalog/products/${productId}`),
      bcFetch(env, `/catalog/products/${productId}/variants`, { limit: 250 }),
    ]);
    const p = product.data ?? {};
    return jsonText({
      product: {
        id: p.id, name: p.name, sku: p.sku,
        inventory_level: p.inventory_level,
        inventory_warning_level: p.inventory_warning_level,
        inventory_tracking: p.inventory_tracking,
        availability: p.availability,
      },
      variants: (variants.data ?? []).map((v: any) => ({
        id: v.id, sku: v.sku,
        inventory_level: v.inventory_level,
        inventory_warning_level: v.inventory_warning_level,
      })),
    });
  });

  return server;
}

export default {
  async fetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return Response.json({
      service: "BodineDirect BigCommerce MCP", status: "online",
      transport: "Streamable HTTP", mcp: "/mcp", access: "read-only",
    });

    if (url.pathname === "/test-bigcommerce") {
      try {
        const result = await bcFetch(env, "/catalog/products", { limit: 1 });
        const p = result.data?.[0];
        return Response.json({
          success: true, store: env.BIGCOMMERCE_STORE_HASH,
          productsReturned: result.data?.length ?? 0,
          sampleProduct: p ? { id: p.id, name: p.name, sku: p.sku } : null,
        });
      } catch (error) {
        return Response.json({ success: false, message: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
      }
    }

    if (url.pathname === "/mcp") {
      const handler = createMcpHandler(() => makeServer(env));
      return handler(request, env, ctx);
    }
    return new Response("Not Found", { status: 404 });
  },
};
