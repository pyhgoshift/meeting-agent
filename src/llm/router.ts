import { callWithFallback, LLMResponse, Provider } from './fallback.js';
import type { ChatOptions } from './providers/deepseek.js';

export type Mode = 'fast' | 'smart' | 'hybrid' | 'auto';

export type Task =
  | 'summary'
  | 'decisions'
  | 'action_items'
  | 'json_structure'
  | 'slack_message';

const SMART_KEYWORDS = ['결정', '확정', '예산', '법적', '계약', '승인', '이사회'];

const MATRIX: Record<Mode, Record<Task, [Provider, ...Provider[]]>> = {
  fast: {
    summary:        ['deepseek', 'groq'],
    decisions:      ['deepseek', 'groq'],
    action_items:   ['deepseek', 'groq'],
    json_structure: ['deepseek', 'groq'],
    slack_message:  ['deepseek', 'groq'],
  },
  smart: {
    summary:        ['claude-sonnet', 'claude-haiku'],
    decisions:      ['claude-sonnet', 'claude-haiku'],
    action_items:   ['claude-sonnet', 'claude-haiku'],
    json_structure: ['claude-sonnet', 'claude-haiku'],
    slack_message:  ['claude-haiku', 'deepseek'],
  },
  hybrid: {
    summary:        ['deepseek', 'groq', 'claude-haiku'],
    decisions:      ['claude-sonnet', 'claude-haiku', 'deepseek'],
    action_items:   ['deepseek', 'groq'],
    json_structure: ['claude-haiku', 'deepseek'],
    slack_message:  ['claude-haiku', 'deepseek'],
  },
  auto: {
    summary:        ['deepseek', 'groq'],
    decisions:      ['deepseek', 'groq'],
    action_items:   ['deepseek', 'groq'],
    json_structure: ['deepseek', 'groq'],
    slack_message:  ['deepseek', 'groq'],
  },
};

function resolveMode(mode: Mode, transcript: string): Mode {
  if (mode !== 'auto') return mode;
  return SMART_KEYWORDS.some(kw => transcript.includes(kw)) ? 'smart' : 'fast';
}

export async function routedCall(
  mode: Mode,
  task: Task,
  system: string,
  user: string,
  transcript = '',
  options: ChatOptions = {},
): Promise<LLMResponse> {
  const resolved = resolveMode(mode, transcript);
  const [primary, ...fallbacks] = MATRIX[resolved][task];
  return callWithFallback(primary, fallbacks, system, user, options);
}
