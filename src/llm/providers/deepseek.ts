import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

export const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? 'deepseek-ai/deepseek-v4-pro';

export interface ChatOptions {
  /** 응답 길이 상한. 항목을 여럿 뽑는 작업은 기본값으로는 중간에 잘린다. */
  maxTokens?: number;
  /**
   * 이 JSON 스키마대로만 답하게 강제한다.
   *
   * NIM 은 nvext.guided_json 으로 생성 단계에서 형식을 붙든다. 프롬프트로 "JSON 만
   * 내놔라" 하고 비는 것과 다르다 — 스키마에서 벗어난 토큰이 아예 나오지 않는다.
   * 소요시간을 "4" 대신 4 로 써서 도출 전체가 버려진 적이 있는데, 그런 어긋남을
   * 애초에 막는다.
   */
  jsonSchema?: Record<string, unknown>;
}

export async function chatDeepSeek(
  systemPrompt: string,
  userContent: string,
  options: ChatOptions = {},
): Promise<string> {
  const params = {
    model: NVIDIA_MODEL,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ],
    temperature: 0.3,
    top_p: 0.95,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (!options.jsonSchema) {
    const completion = await client.chat.completions.create(params);
    return completion.choices[0]?.message?.content ?? '';
  }

  // nvext 는 OpenAI 규격 밖의 NVIDIA 확장이라 SDK 타입에 없다.
  const guided = { ...params, nvext: { guided_json: options.jsonSchema } };

  try {
    const completion = await client.chat.completions.create(guided as typeof params);
    return completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    // 모델이나 엔드포인트가 guided_json 을 안 받으면 그것 때문에 작업을 접지는 않는다.
    // 형식 보장 없이라도 뽑아내고, 뒤에서 관대하게 읽는다.
    const status = (err as { status?: number }).status;
    if (status !== 400 && status !== 422) throw err;

    console.warn(`[deepseek] ${NVIDIA_MODEL} 이 guided_json 을 거부했습니다 (${status}). 형식 강제 없이 재시도합니다.`);
    const completion = await client.chat.completions.create(params);
    return completion.choices[0]?.message?.content ?? '';
  }
}
