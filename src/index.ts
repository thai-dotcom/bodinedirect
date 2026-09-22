export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // ROOT STATUS
    if (url.pathname === "/") {
      return Response.json({
        service: "BodineDirect BigCommerce MCP",
        status: "online",
        transport: "Streamable HTTP",
        mcp: "/mcp",
        access: "read-only",
      });
    }

    // DIRECT BIGCOMMERCE TEST
    if (url.pathname === "/test-bigcommerce") {
      try {
        const result = await bcFetch(
          env,
          "/catalog/products",
          { limit: 1 }
        );

        const p = result.data?.[0];

        return Response.json({
          success: true,
          store: env.BIGCOMMERCE_STORE_HASH,
          productsReturned: result.data?.length ?? 0,
          sampleProduct: p
            ? {
                id: p.id,
                name: p.name,
                sku: p.sku,
              }
            : null,
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

    // MCP - AUTHENTICATED
    if (
      url.pathname === "/mcp" ||
      url.pathname === "/mcp/"
    ) {
      const authHeader =
        request.headers.get("Authorization");

      // TEMPORARY SAFE AUTH DIAGNOSTIC
      if (
        authHeader !==
        `Bearer ${env.MCP_AUTH_TOKEN}`
      ) {
        const receivedToken =
          authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : "";

        return Response.json(
          {
            error: "Unauthorized",
            authHeaderPresent: !!authHeader,
            bearerPrefixPresent:
              authHeader?.startsWith("Bearer ") ??
              false,
            receivedTokenLength:
              receivedToken.length,
            expectedTokenLength:
              env.MCP_AUTH_TOKEN?.length ?? 0,
          },
          { status: 401 }
        );
      }

      const handler = createMcpHandler(
        () => makeServer(env),
        {
          route: "/mcp",
          onerror: (error) => {
            console.error(
              "MCP HANDLER ERROR:",
              error
            );
            console.error(
              "MCP HANDLER STACK:",
              error.stack
            );
          },
        }
      );

      return handler(request, env, ctx);
    }

    // EVERYTHING ELSE
    return new Response("Not Found", {
      status: 404,
    });
  },
};
