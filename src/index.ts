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
  const server = new McpServer({
    name: "BodineDirect BigCommerce",
    version: "1.0.0",
  });

  server.registerTool(
    "ping",
    {
      description: "Test the BodineDirect MCP connection.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "BodineDirect MCP is working",
        },
      ],
    })
  );

  return server;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        service: "BodineDirect BigCommerce MCP",
        status: "online",
        transport: "Streamable HTTP",
        mcp: "/mcp",
        access: "read-only",
      });
    }

    if (url.pathname === "/test-bigcommerce") {
      try {
        const result = await bcFetch(env, "/catalog/products", { limit: 1 });
        const p = result.data?.[0];

        return Response.json({
          success: true,
          store: env.BIGCOMMERCE_STORE_HASH,
          productsReturned: result.data?.length ?? 0,
          sampleProduct: p
            ? { id: p.id, name: p.name, sku: p.sku }
            : null,
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            message:
              error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

    const handler = createMcpHandler(
      () => makeServer(env),
      {
        route: "/mcp",
        onerror: (error) => {
          console.error("MCP HANDLER ERROR:", error);
          console.error("MCP HANDLER STACK:", error.stack);
        },
      }
    );

    return handler(request, env, ctx);
  },
};
