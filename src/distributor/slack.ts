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

  const slackTitle = analysis.title || fileName;
  const attendees = analysis.attendees?.join(', ') || '미지정';
  const agenda = analysis.agenda || '없음';

  // 1. 외부 템플릿(slack_template.txt) 확인
  const WATCH_DIR = process.env.WATCH_DIR ?? './recordings';
  const fsMod = await import('fs');
  const pathMod = await import('path');
  const templatePath = pathMod.join(WATCH_DIR, 'slack_template.txt');

  if (fsMod.existsSync(templatePath)) {
    let template = fsMod.readFileSync(templatePath, 'utf-8');
    
    // 치환 (Placeholder replacement)
    template = template
      .replace(/\{\{title\}\}/g, slackTitle)
      .replace(/\{\{attendees\}\}/g, attendees)
      .replace(/\{\{agenda\}\}/g, agenda)
      .replace(/\{\{summary\}\}/g, analysis.summary)
      .replace(/\{\{decisions\}\}/g, decisions)
      .replace(/\{\{todos\}\}/g, todos)
      .replace(/\{\{schedules\}\}/g, schedules)
      .replace(/\{\{fileName\}\}/g, fileName);

    await slack.chat.postMessage({
      channel: CHANNEL,
      text: `회의록 분석 완료: ${slackTitle}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: template },
        }
      ],
    });
    return;
  }

  // 2. 외부 템플릿이 없을 경우 기본 (Block Kit) 디자인 전송
  await slack.chat.postMessage({
    channel: CHANNEL,
    text: `회의록 분석 완료: ${slackTitle}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📋 ${slackTitle}`, emoji: true },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `👥 참석자: ${attendees}` },
          { type: 'mrkdwn', text: `🎯 안건: ${agenda}` }
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📝 요약*\n${analysis.summary}` },
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
