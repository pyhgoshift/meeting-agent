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

    try {
      await slack.chat.postMessage({
        channel: CHANNEL,
        text: `<!channel> 🚨 회의록 분석 완료: ${slackTitle}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '<!channel> 🚨 새로운 회의록 분석이 완료되었습니다!' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: template },
          }
        ],
      });
      return;
    } catch (e: any) {
      console.warn(`⚠️ 슬랙 블록 전송 실패 (템플릿 오류 또는 3000자 초과). 일반 텍스트로 폴백합니다: ${e.message}`);
      await slack.chat.postMessage({
        channel: CHANNEL,
        text: `<!channel> 🚨 회의록 분석 완료 (템플릿 오류로 기본 텍스트 전송): ${slackTitle}\n\n${template}`.substring(0, 3999),
      });
      return;
    }
  }

  // 2. 외부 템플릿이 없을 경우 기본 (Block Kit) 디자인 전송
  try {
    await slack.chat.postMessage({
      channel: CHANNEL,
      text: `<!channel> 🚨 회의록 분석 완료: ${slackTitle}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '<!channel> 🚨 새로운 회의록 분석이 완료되었습니다!' },
        },
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
          text: { type: 'mrkdwn', text: `*📝 요약*\n${analysis.summary}`.substring(0, 2999) },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*✅ 결정사항*\n${decisions}`.substring(0, 2999) },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*📌 할일*\n${todos}`.substring(0, 2999) },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*📅 일정*\n${schedules}`.substring(0, 2999) },
        },
      ],
    });
  } catch (e: any) {
    console.warn(`⚠️ 슬랙 기본 블록 전송 실패. 일반 텍스트로 폴백합니다: ${e.message}`);
    await slack.chat.postMessage({
      channel: CHANNEL,
      text: `<!channel> 🚨 회의록 분석 완료: ${slackTitle}\n\n*📝 요약*\n${analysis.summary}\n\n*✅ 결정사항*\n${decisions}\n\n*📌 할일*\n${todos}`.substring(0, 3999),
    });
  }
}
