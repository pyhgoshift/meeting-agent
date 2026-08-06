import { WebClient } from '@slack/web-api';
import type { MeetingAnalysisFull } from '../extract/schema.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL = process.env.SLACK_CHANNEL_ID ?? '';

function blocksToText(analysis: MeetingAnalysisFull): string {
  const s = analysis.SessionSummary.blocks.map(b => b.content).join('\n');
  const decisions = analysis.KeyItemsDecisions.blocks.map(b => `• ${b.content}`).join('\n') || '없음';
  const actions = analysis.ImmediateActionItems.blocks.map(b => `• ${b.content}`).join('\n') || '없음';
  const deadlines = analysis.CriticalDeadlines.blocks.map(b => `• ${b.content}`).join('\n') || '없음';
  const people = analysis.People.blocks.map(b => b.content).join(', ') || '미지정';

  return `👥 참석자: ${people}\n📝 요약: ${s}\n✅ 결정: ${decisions}\n📌 할일: ${actions}\n⏰ 마감: ${deadlines}`;
}

export async function sendStructuredMeeting(
  analysis: MeetingAnalysisFull,
  fileName: string,
  modelUsed: string,
  costUsd: number,
): Promise<void> {
  const title = analysis.MeetingName || fileName;
  const people = analysis.People.blocks.map(b => b.content).join(', ') || '미지정';
  const summary = analysis.SessionSummary.blocks.map(b => b.content).join('\n').substring(0, 800);
  const decisions = analysis.KeyItemsDecisions.blocks.map(b => `• ${b.content}`).join('\n').substring(0, 800) || '없음';
  const actions = analysis.ImmediateActionItems.blocks.map(b => `• ${b.content}`).join('\n').substring(0, 800) || '없음';
  const deadlines = analysis.CriticalDeadlines.blocks.map(b => `• ${b.content}`).join('\n') || '없음';

  try {
    await slack.chat.postMessage({
      channel: CHANNEL,
      text: `<!channel> 회의록 완료: ${title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '<!channel> *새 회의록이 생성되었습니다.*' } },
        { type: 'header', text: { type: 'plain_text', text: `📋 ${title}`, emoji: true } },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `👥 *참석자:* ${people}` },
            { type: 'mrkdwn', text: `🤖 *모델:* ${modelUsed} | *비용:* $${costUsd.toFixed(4)}` },
          ],
        },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `*📝 회의 요약*\n${summary}` } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `*✅ 핵심 결정사항*\n${decisions}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*📌 즉시 실행 항목*\n${actions}` } },
        ...(deadlines !== '없음'
          ? [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: `*⏰ 주요 마감일*\n${deadlines}` } }]
          : []),
      ],
    });
  } catch (e: any) {
    console.warn(`⚠️ Slack 블록 전송 실패, 텍스트 폴백: ${e.message}`);
    await slack.chat.postMessage({
      channel: CHANNEL,
      text: `<!channel> 📋 ${title}\n\n${blocksToText(analysis)}`.substring(0, 3999),
    });
  }
}
