import Groq from 'groq-sdk';

let client: Groq | null = null;

function getClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY 환경변수가 설정되지 않았습니다.');
    client = new Groq({ apiKey });
  }
  return client;
}

export interface GroqLLMResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chatGroq(
  systemPrompt: string,
  userMessage: string,
  model = 'llama-3.3-70b-versatile',
): Promise<GroqLLMResponse> {
  const completion = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });
  const content = completion.choices[0]?.message?.content ?? '';
  return {
    content,
    model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}
