import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ClaudeResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chatClaude(
  systemPrompt: string,
  userMessage: string,
  model = 'claude-haiku-4-5-20251001',
): Promise<ClaudeResponse> {
  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');
  return { content, model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}
