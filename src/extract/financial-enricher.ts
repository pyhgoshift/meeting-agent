import { callTool, listTools } from '../llm/providers/financial-datasets.js';
import type { MeetingAnalysis } from './analyzer.js';

// Korean and English financial keywords that trigger enrichment
const FINANCIAL_KEYWORDS = [
  '주가', '주식', '시가총액', '배당', '재무', '매출', '영업이익', '순이익',
  '티커', '종목', '코스피', '나스닥', 'PER', 'PBR', 'EPS',
  'stock', 'ticker', 'revenue', 'earnings', 'EPS', 'dividend', 'market cap',
  'financial', 'quarterly', 'annual report', 'balance sheet',
];

export interface FinancialContext {
  tickers: string[];
  data: Record<string, string>;
}

function detectTickers(text: string): string[] {
  // Match 1-5 uppercase letter sequences that look like stock tickers
  const tickerPattern = /\b([A-Z]{1,5})\b/g;
  const candidates = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tickerPattern.exec(text)) !== null) {
    const word = m[1];
    // Skip common uppercase acronyms that aren't tickers
    if (!['AI', 'CEO', 'CFO', 'CTO', 'API', 'KPI', 'MCP', 'OK', 'IT', 'HR', 'PR', 'QA'].includes(word)) {
      candidates.add(word);
    }
  }
  return [...candidates];
}

function hasFinancialContent(text: string): boolean {
  const lower = text.toLowerCase();
  return FINANCIAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function enrichWithFinancialData(
  analysis: MeetingAnalysis,
  transcript: string,
): Promise<FinancialContext | null> {
  const fullText = `${transcript} ${analysis.summary} ${analysis.decisions.join(' ')}`;

  if (!hasFinancialContent(fullText)) return null;

  const tickers = detectTickers(fullText);
  if (tickers.length === 0) return null;

  // Verify which tools are available on this MCP server
  let tools: string[];
  try {
    const available = await listTools();
    tools = available.map((t) => t.name);
  } catch {
    return null;
  }

  const data: Record<string, string> = {};

  for (const ticker of tickers.slice(0, 5)) {
    // Try to get price data if the tool exists
    const priceTool = tools.find((t) => t.includes('price') || t.includes('quote'));
    if (priceTool) {
      try {
        data[`${ticker}_price`] = await callTool(priceTool, { ticker });
      } catch {
        // Non-fatal: skip unavailable tickers
      }
    }

    // Try to get financials if available
    const financialsTool = tools.find((t) => t.includes('financial') || t.includes('income'));
    if (financialsTool) {
      try {
        data[`${ticker}_financials`] = await callTool(financialsTool, { ticker });
      } catch {
        // Non-fatal
      }
    }
  }

  if (Object.keys(data).length === 0) return null;

  return { tickers, data };
}
