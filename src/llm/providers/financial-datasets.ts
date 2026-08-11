/**
 * MCP client for the financial-datasets server (http://mcp.financialdatasets.ai).
 * Uses JSON-RPC 2.0 over HTTP (MCP streamable-HTTP transport).
 */

const MCP_URL = process.env.FINANCIAL_DATASETS_MCP_URL ?? 'http://mcp.financialdatasets.ai';
const API_KEY = process.env.FINANCIAL_DATASETS_API_KEY;

interface McpRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
}

let requestId = 1;

async function mcpRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const body: McpRequest = { jsonrpc: '2.0', id: requestId++, method, params };

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as McpResponse<T>;
  if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

export async function listTools(): Promise<Tool[]> {
  const result = await mcpRequest<{ tools: Tool[] }>('tools/list');
  return result.tools ?? [];
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await mcpRequest<ToolCallResult>('tools/call', {
    name,
    arguments: args,
  });
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}
