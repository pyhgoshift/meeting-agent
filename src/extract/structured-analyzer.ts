import { routedCall, Mode } from '../llm/router.js';
import { MeetingAnalysisFullSchema, MeetingAnalysisFull, STRUCTURED_SYSTEM_PROMPT } from './schema.js';
import { estimateCost, roughTokens } from '../llm/cost-tracker.js';

const CHUNK_SIZE = 5000;
const OVERLAP   = 1000;

function splitChunks(text: string): string[] {
  const step = CHUNK_SIZE - OVERLAP;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function mergeResults(parts: MeetingAnalysisFull[]): MeetingAnalysisFull {
  const merged = structuredClone(parts[0]);
  for (const part of parts.slice(1)) {
    if (!merged.MeetingName && part.MeetingName) merged.MeetingName = part.MeetingName;
    for (const key of ['People', 'SessionSummary', 'CriticalDeadlines', 'KeyItemsDecisions', 'ImmediateActionItems', 'NextSteps'] as const) {
      merged[key].blocks.push(...part[key].blocks);
    }
    merged.MeetingNotes.sections.push(...part.MeetingNotes.sections);
    if (!merged.MeetingNotes.meeting_name) merged.MeetingNotes.meeting_name = part.MeetingNotes.meeting_name;
  }
  return merged;
}

function parseResponse(raw: string, retryFn: () => Promise<MeetingAnalysisFull>): MeetingAnalysisFull | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return MeetingAnalysisFullSchema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

export interface AnalyzeResult {
  analysis: MeetingAnalysisFull;
  modelUsed: string;
  costUsd: number;
  chunks: number;
}

export async function analyzeStructured(
  transcript: string,
  mode: Mode = 'hybrid',
  customPrompt?: string,
): Promise<AnalyzeResult> {
  const kst = new Date();
  kst.setHours(kst.getHours() + 9);
  const currentDate = kst.toISOString().split('T')[0];

  const systemPrompt = customPrompt
    ? `${STRUCTURED_SYSTEM_PROMPT}\n\n[사용자 추가 지시사항]\n${customPrompt}\n[현재 날짜(한국): ${currentDate}]`
    : `${STRUCTURED_SYSTEM_PROMPT}\n[현재 날짜(한국): ${currentDate}]`;

  const chunks = splitChunks(transcript);
  const results: MeetingAnalysisFull[] = [];
  let totalCost = 0;
  let lastModel = '';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const userMsg = `회의 전사본 (${i + 1}/${chunks.length}):\n${chunk}`;

    let response = await routedCall(mode, 'json_structure', systemPrompt, userMsg, transcript);
    let parsed = parseResponse(response.content, async () => {
      response = await routedCall(mode, 'json_structure', systemPrompt, userMsg, transcript);
      const r = parseResponse(response.content, async () => { throw new Error('재시도 실패'); });
      if (!r) throw new Error(`청크 ${i + 1} JSON 파싱 최종 실패`);
      return r;
    });

    if (!parsed) {
      response = await routedCall(mode, 'json_structure', systemPrompt, userMsg, transcript);
      parsed = parseResponse(response.content, async () => { throw new Error('2차 재시도 실패'); });
      if (!parsed) throw new Error(`청크 ${i + 1} JSON 파싱 실패`);
    }

    results.push(parsed);
    lastModel = response.model;

    const inTokens = response.inputTokens || roughTokens(systemPrompt + userMsg);
    const outTokens = response.outputTokens || roughTokens(response.content);
    totalCost += estimateCost(response.model, inTokens, outTokens);
  }

  return {
    analysis: mergeResults(results),
    modelUsed: lastModel,
    costUsd: totalCost,
    chunks: chunks.length,
  };
}
