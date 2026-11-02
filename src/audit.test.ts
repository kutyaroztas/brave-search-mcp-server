import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { connectTestClient } from './testUtils/mcpTestHarness.js';

test('records the actual MCP client, query and time; refuses unlogged calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brave-audit-'));
  const log = join(dir, 'audit.jsonl');
  const oldFetch = globalThis.fetch;
  process.env.BRAVE_MCP_AUDIT_LOG = log;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({
        web: { results: [{ url: 'https://example.com', title: 'Example', description: 'test' }] },
      }),
      { status: 200 }
    );
  }) as typeof fetch;
  const client = await connectTestClient();
  try {
    const result = await client.callTool({
      name: 'brave_web_search',
      arguments: { query: 'test query' },
    });
    assert.equal(result.isError, false);
    const entry = JSON.parse(readFileSync(log, 'utf8'));
    assert.equal(entry.client, 'test-client');
    assert.equal(entry.client_version, '0.0.0');
    assert.equal(entry.tool, 'brave_web_search');
    assert.equal(entry.query, 'test query');
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
    assert.equal(statSync(log).mode & 0o777, 0o600);
    rmSync(log);
    rmSync(dir, { recursive: true });
    const failed = await client.callTool({
      name: 'brave_web_search',
      arguments: { query: 'must not send' },
    });
    assert.equal(failed.isError, true);
    assert.equal(calls, 1);
  } finally {
    await client.close();
    globalThis.fetch = oldFetch;
    delete process.env.BRAVE_MCP_AUDIT_LOG;
    rmSync(dir, { recursive: true, force: true });
  }
});
