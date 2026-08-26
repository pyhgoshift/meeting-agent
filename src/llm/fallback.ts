import { chatDeepSeek } from './providers/deepseek.js';
import { chatClaude } from './providers/claude.js';
import { chatGroq } from './providers/groq-llm.js';

export interface LLMResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
}

export type Provider = 'deepseek' | 'claude-haiku' | 'claude-sonnet' | 'groq';

async function callProvider(provider: Provider, system: string, user: string): Promise<LLMResponse> {
  switch (provider) {
    case 'deepseek': {
      const raw = await chatDeepSeek(system, user);
      return { content: raw, model: 'deepseek-ai/deepseek-v3-0324', inputTokens: 0, outputTokens: 0, provider };
    }
    case 'claude-haiku': {
      const r = await chatClaude(system, user, 'claude-haiku-4-5-20251001');
      return { ...r, provider };
    }
    case 'claude-sonnet': {
      const r = await chatClaude(system, user, 'claude-sonnet-5');
      return { ...r, provider };
    }
    case 'groq': {
      const r = await chatGroq(system, user);
      return { ...r, provider };
    }
  }
}

export async function callWithFallback(
  primary: Provider,
  fallbacks: Provider[],
  system: string,
  user: string,
): Promise<LLMResponse> {
  const chain = [primary, ...fallbacks];
  const failures: string[] = [];

  for (const provider of chain) {
    try {
      return await callProvider(provider, system, user);
    } catch (err) {
      failures.push(`${provider}: ${(err as Error).message}`);
      console.warn(`[fallback] ${provider} 실패 → 다음 시도: ${err}`);
    }
  }

  // 마지막 하나의 사유만 올리면 엉뚱한 곳을 보게 된다. 실제로 첫 제공자가 410 으로
  // 죽었는데 "GROQ_API_KEY 가 없다"는 메시지만 화면에 떠서 원인을 가린 적이 있다.
  throw new Error(`모든 LLM 제공자 실패 — ${failures.join(' / ')}`);
}
