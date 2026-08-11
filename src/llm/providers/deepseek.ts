import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

const MODEL = process.env.NVIDIA_MODEL ?? 'deepseek-ai/deepseek-v4-pro';

export async function chatDeepSeek(systemPrompt: string, userContent: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    top_p: 0.95,
    max_tokens: 4096,
  });
  return completion.choices[0]?.message?.content ?? '';
}
