import { Client } from '@notionhq/client';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js';
import type { MeetingAnalysisFull, Section, Block } from '../extract/schema.js';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID ?? '';

function rt(content: string) {
  return [{ type: 'text' as const, text: { content: content.slice(0, 2000) } }];
}

export async function saveStructuredMeetingToNotion(
  analysis: MeetingAnalysisFull,
  fileName: string,
  durationSec: number,
  modelUsed: string,
  costUsd: number,
): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const people = analysis.People.blocks.map(b => b.content).join(', ') || '미지정';
  const summary = analysis.SessionSummary.blocks.map(b => b.content).join('\n');
  const decisions = analysis.KeyItemsDecisions.blocks.map(b => b.content).join('\n') || '없음';
  const actions = analysis.ImmediateActionItems.blocks.map(b => b.content).join('\n') || '없음';
  const page = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      이름:         { title: rt(analysis.MeetingName || fileName) },
      날짜:         { date: { start: today } },
      요약:         { rich_text: rt(summary.slice(0, 2000)) },
      결정사항:     { rich_text: rt(decisions.slice(0, 2000)) },
      할일:         { rich_text: rt(actions.slice(0, 2000)) },
      참석자:       { rich_text: rt(people) },
      파일명:       { rich_text: rt(fileName) },
      '처리시간(초)': { number: Math.round(durationSec) },
    },
    children: buildBody(analysis, modelUsed, costUsd),
  });
  return (page as unknown as { url: string }).url;
}

function blockItem(b: Block): BlockObjectRequest {
  switch (b.type) {
    case 'heading1': return { object: 'block', type: 'heading_2', heading_2: { rich_text: rt(b.content) } };
    case 'heading2': return { object: 'block', type: 'heading_3', heading_3: { rich_text: rt(b.content) } };
    case 'bullet':   return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(b.content) } };
    default:         return { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(b.content) } };
  }
}

function sectionToBlocks(section: Section): BlockObjectRequest[] {
  return [{ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(section.title) } }, ...section.blocks.map(blockItem)];
}

function buildBody(analysis: MeetingAnalysisFull, modelUsed: string, costUsd: number): BlockObjectRequest[] {
  const d = (): BlockObjectRequest => ({ object: 'block', type: 'divider', divider: {} });
  const blocks: BlockObjectRequest[] = [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: rt('📝 회의 요약') } },
    ...analysis.SessionSummary.blocks.map(blockItem), d(),
    ...sectionToBlocks(analysis.People), d(),
    ...sectionToBlocks(analysis.KeyItemsDecisions), d(),
    ...sectionToBlocks(analysis.ImmediateActionItems), d(),
    ...(analysis.CriticalDeadlines.blocks.length ? [...sectionToBlocks(analysis.CriticalDeadlines), d()] : []),
    ...(analysis.NextSteps.blocks.length ? [...sectionToBlocks(analysis.NextSteps), d()] : []),
    ...analysis.MeetingNotes.sections.flatMap(sectionToBlocks),
    d(),
    { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(`🤖 모델: ${modelUsed} | 비용: $${costUsd.toFixed(4)}`) } },
  ];
  return blocks.slice(0, 100);
}
