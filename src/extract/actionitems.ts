import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { routedCall } from '../llm/router.js';
import type { SheetSnapshot } from '../distributor/actionitem-sheet.js';

/**
 * 주간보고에서 관리 가능한 작업 항목을 도출한다.
 *
 * 표에서 값을 옮기는 게 아니다. 보고서 전체를 읽고, 흩어져 있는 서술에서
 * "누가 언제까지 무엇을 한다"를 끌어내 시트 양식으로 정리한다. 문장 안에
 * 묻혀 있는 일정도, 표에 없는 일도 항목이 된다.
 */

// 시트 열 이름과 코드 안의 이름을 잇는 표. 스키마에 한글 키를 쓰면
// JSON 스키마로 오갈 때 다루기 번거로워서, 안에서는 영문으로 쓰고 여기서만 옮긴다.
const COLUMN_MAP = {
  status: '상태',
  startDate: '시작일',
  endDate: '종료일',
  category: '구분',
  team: '팀구분',
  task: '작업내용',
  startTime: '시작시간',
  durationHours: '소요시간',
  location: '장소',
  owner: '대표자',
  phone: '전화번호',
  headcount: '작업인원(명)',
} as const;

const ItemSchema = z.object({
  task: z.string().describe('할 일 한 줄. 명사형으로 끝낸다. 예) DNS 전환 영향도 분석'),
  status: z.string().describe('계획 또는 완료. 아직 안 끝난 일은 계획'),
  startDate: z.string().describe('YYYY-MM-DD. 모르면 빈 문자열'),
  endDate: z.string().describe('YYYY-MM-DD. 하루짜리면 시작일과 같게. 모르면 빈 문자열'),
  category: z.string().describe('구분. 주어진 목록에서 고르되, 어느 것에도 안 맞으면 새로 짓는다'),
  team: z.string().describe('팀구분. 위와 같다'),
  startTime: z.string().describe('HH:mm. 문서에 없으면 빈 문자열 — 지어내지 않는다'),
  durationHours: z.string().describe('소요 시간(시간 단위 숫자). 모르면 빈 문자열'),
  location: z.string().describe('장소. 문서에 없으면 빈 문자열'),
  owner: z.string().describe('대표자 이름. 문서에 없으면 빈 문자열'),
  phone: z.string().describe('전화번호. 문서에 적혀 있을 때만'),
  headcount: z.string().describe('작업인원 수. 문서에 적혀 있을 때만'),
  evidence: z.string().describe('이 항목의 근거가 된 보고서의 원문 한 대목. 사람이 확인할 수 있게'),
  confidence: z.enum(['high', 'medium', 'low']).describe('문서에 명시적이면 high, 추론했으면 low'),
});

const ResultSchema = z.object({
  items: z.array(ItemSchema),
  notes: z.string().describe('도출하면서 판단이 갈렸던 점이나 사람이 확인해야 할 것'),
});

export type DerivedItem = z.infer<typeof ItemSchema>;

export interface DerivationResult {
  items: DerivedItem[];
  notes: string;
  /** 어느 모델이 도출했는지. 폴백이 돌면 정확도가 달라지므로 화면에 보여준다. */
  model: string;
  skipped: number;
}

export function buildSystemPrompt(snap: SheetSnapshot | null, referenceDate: string): string {
  const categories = snap?.categories ?? [];
  const teams = snap?.teams ?? [];
  const existing = (snap?.rows ?? []).map(r => r['작업내용']).filter(Boolean);

  return `당신은 주간업무보고를 읽고 팀의 작업 일정표를 만드는 업무 관리자입니다.

## 할 일

보고서를 처음부터 끝까지 읽고, **관리해야 할 작업 항목을 전부 뽑아내십시오.**

표에 정리된 것만 옮기는 게 아닙니다. 보고서의 서술 문장, 진행 경과, 계획,
협의 내용, 문제점과 대응 방안 어디에 묻혀 있든 "해야 할 일"이면 항목이 됩니다.

예를 들어 이런 문장에서도 항목이 나옵니다:
- "다음 주 중 KT와 회선 이설 일정을 협의할 예정임" → 회선 이설 일정 협의 (계획)
- "장비 반입이 지연되어 검수가 밀리고 있음" → 장비 반입 지연 대응 / 검수 재일정 (계획)
- "지난주 방화벽 정책 적용을 완료함" → 방화벽 정책 적용 (완료)

## 판단 기준

**항목이 되는 것** — 시작과 끝이 있고, 누군가 책임지며, 진행 여부를 확인할 수 있는 일.

**항목이 아닌 것** — 단순 현황 서술("서버 12대 운영 중"), 의견, 배경 설명,
그리고 이미 끝나서 더 관리할 필요가 없는 과거 사실.

하나의 큰 일이 여러 단계로 쪼개져 서술돼 있으면 **단계별로 나누십시오.**
반대로 같은 일이 여러 곳에서 반복 언급되면 **하나로 합치십시오.**

## 날짜

기준일은 ${referenceDate}입니다. "다음 주", "이달 말", "3분기" 같은 표현은
이 날짜를 기준으로 실제 날짜(YYYY-MM-DD)로 바꾸십시오.
범위가 애매하면 그 주의 금요일처럼 합리적인 날을 잡되, confidence를 low로 두십시오.
전혀 짐작할 수 없으면 빈 문자열로 두십시오. **아무 날짜나 넣지 마십시오.**

## 분류

구분은 다음 중에서 고르십시오: ${categories.length ? categories.join(', ') : '(기존 값 없음 — 새로 지으십시오)'}
팀구분은 다음 중에서 고르십시오: ${teams.length ? teams.join(', ') : '(기존 값 없음 — 새로 지으십시오)'}

어느 것에도 맞지 않으면 새 값을 지어도 됩니다. 억지로 끼워 맞추지 마십시오.

## 지어내지 말 것

전화번호, 대표자, 장소, 인원수는 **보고서에 적혀 있을 때만** 채우십시오.
없으면 빈 문자열로 두십시오. 그럴듯한 값을 만들어 넣는 것이 빈칸보다 나쁩니다.

## 이미 등록된 작업

아래는 이미 시트에 있는 작업입니다. **같은 일은 다시 만들지 마십시오.**
표현이 조금 달라도 같은 일이면 건너뛰십시오.

${existing.length ? existing.map(t => `- ${t}`).join('\n') : '(없음)'}

## 근거

항목마다 evidence에 그 근거가 된 보고서의 문장을 그대로 옮기십시오.
사람이 검토할 때 어디서 나온 항목인지 확인해야 합니다.`;
}

/** 시트에 넣을 수 있는 형태(한글 열 이름)로 바꾼다. */
export function toSheetRow(item: DerivedItem): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [key, header] of Object.entries(COLUMN_MAP)) {
    row[header] = (item as unknown as Record<string, string>)[key] ?? '';
  }
  return row;
}

/** 이미 시트에 있는 작업과 겹치는 것을 걸러낸다. 모델이 놓쳤을 때의 그물. */
export function dropDuplicates(items: DerivedItem[], snap: SheetSnapshot | null): { kept: DerivedItem[]; skipped: number } {
  const normalize = (s: string) => s.replace(/[\s()[\]{}.,·・\-–—]/g, '').toLowerCase();
  const seen = new Set((snap?.rows ?? []).map(r => normalize(r['작업내용'] ?? '')).filter(Boolean));

  const kept: DerivedItem[] = [];
  let skipped = 0;
  for (const item of items) {
    const key = normalize(item.task);
    if (!key) continue;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    kept.push(item);
  }
  return { kept, skipped };
}

async function deriveWithClaude(
  documentText: string,
  system: string,
): Promise<{ items: DerivedItem[]; notes: string; model: string }> {
  const model = process.env.ACTIONITEM_MODEL ?? 'claude-opus-5';
  const client = new Anthropic();

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: `다음은 주간업무보고 전문입니다.\n\n${documentText}` }],
    output_config: { format: zodOutputFormat(ResultSchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`모델이 응답을 거부했습니다: ${response.stop_details?.explanation ?? '사유 미상'}`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('항목이 너무 많아 응답이 잘렸습니다. 보고서를 나눠서 올려주세요.');
  }
  if (!response.parsed_output) {
    throw new Error('응답을 구조화하지 못했습니다.');
  }

  return { ...response.parsed_output, model };
}

/** ANTHROPIC_API_KEY 가 없을 때의 대비책. 정확도가 낮으므로 화면에 모델명을 띄운다. */
async function deriveWithFallback(
  documentText: string,
  system: string,
): Promise<{ items: DerivedItem[]; notes: string; model: string }> {
  const instruction = `${system}

## 출력 형식

아래 형태의 JSON만 출력하십시오. 설명이나 코드블록 표시 없이 JSON 자체만.

{"items":[{"task":"","status":"계획","startDate":"","endDate":"","category":"","team":"","startTime":"","durationHours":"","location":"","owner":"","phone":"","headcount":"","evidence":"","confidence":"high"}],"notes":""}`;

  const res = await routedCall('fast', 'action_items', instruction, documentText);

  // 모델이 코드블록으로 감싸는 경우가 잦다.
  const cleaned = res.content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const parsed = ResultSchema.safeParse(JSON.parse(cleaned));
  if (!parsed.success) throw new Error(`응답 형식이 스키마와 다릅니다: ${parsed.error.message}`);

  return { ...parsed.data, model: res.model };
}

export async function deriveActionItems(
  documentText: string,
  snapshot: SheetSnapshot | null,
  referenceDate = new Date().toISOString().slice(0, 10),
): Promise<DerivationResult> {
  if (!documentText.trim()) throw new Error('문서에서 읽어낸 내용이 없습니다.');

  const system = buildSystemPrompt(snapshot, referenceDate);

  let raw: { items: DerivedItem[]; notes: string; model: string };
  if (process.env.ANTHROPIC_API_KEY) {
    raw = await deriveWithClaude(documentText, system);
  } else {
    console.warn('[액션아이템] ANTHROPIC_API_KEY 가 없어 대체 모델로 도출합니다. 정확도가 낮을 수 있습니다.');
    raw = await deriveWithFallback(documentText, system);
  }

  const { kept, skipped } = dropDuplicates(raw.items, snapshot);
  console.log(`[액션아이템] ${raw.model} → ${kept.length}건 도출${skipped ? ` (중복 ${skipped}건 제외)` : ''}`);

  return { items: kept, notes: raw.notes, model: raw.model, skipped };
}
