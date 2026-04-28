import { WebClient } from '@slack/web-api';
import type { MeetingAnalysis } from '../extract/analyzer.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL = process.env.SLACK_CHANNEL_ID ?? '';

export async function sendMeetingResult(analysis: MeetingAnalysis, fileName: string): Promise<void> {
  const decisions = analysis.decisions.length
    ? analysis.decisions.map((d) => `• ${d}`).join('\n')
    : '없음';

  const todos = analysis.todos.length
    ? analysis.todos.map((t) => {
        const who = t.assignee ? ` *[${t.assignee}]*` : '';
        const when = t.due ? ` (~${t.due})` : '';
        return `• ${t.task}${who}${when}`;
      }).join('\n')
    : '없음';

  const schedules = analysis.schedules.length
    ? analysis.schedules.map((s) => {
        const date = s.date ? ` - ${s.date}` : '';
        return `• ${s.title}${date}`;
      }).join('\n')
    : '없음';

  await slack.chat.postMessage({
    channel: CHANNEL,
    text: `회의록 분석 완료: ${fileName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📋 회의록 분석 결과`, emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `파일: \`${fileName}\`` }],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*요약*\n${analysis.summary}` },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*✅ 결정사항*\n${decisions}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📌 할일*\n${todos}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📅 일정*\n${schedules}` },
      },
    ],
  });
}
