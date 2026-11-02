import { appendFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Enable explicitly: queries may contain private information. */
export function enableAudit(server: McpServer): void {
  const path = process.env.BRAVE_MCP_AUDIT_LOG;
  if (!path) return;
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: unknown, callback: (...args: any[]) => any) => {
    const wrapped = async (...args: any[]) => {
      const params = args[0] as Record<string, unknown> | undefined;
      const client = server.server.getClientVersion();
      const entry = {
        timestamp: new Date().toISOString(),
        client: process.env.BRAVE_MCP_CLIENT_NAME || client?.name || 'unknown',
        client_version: client?.version ?? null,
        tool: name,
        query: typeof params?.query === 'string' ? params.query : null,
      };
      try {
        appendFileSync(path, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
      } catch (error) {
        // Fail closed: do not silently perform an unlogged search.
        console.error(
          'Brave MCP audit log write failed:',
          error instanceof Error ? error.message : 'unknown error'
        );
        throw new Error('Brave MCP audit log write failed');
      }
      return callback(...args);
    };
    return (register as (...args: any[]) => any)(name, config, wrapped);
  }) as typeof server.registerTool;
}
