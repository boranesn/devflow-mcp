import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("devflow-mcp server running");
}

main().catch((err: unknown) => {
  console.error("Fatal error starting devflow-mcp:", err);
  process.exit(1);
});
