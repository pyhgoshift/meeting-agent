import { WebClient } from '@slack/web-api';
import type { MeetingAnalysis } from '../extract/analyzer.js';
import { peekSequence } from '../utils/sequence.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL = process.env.SLACK_CHANNEL_ID ?? '';

/**
 * 표준 회의록 양식의 참석자 칸. 소속별로 한 줄씩 묶는다.
 * 전사본에서 소속이 안 드러나면 기존처럼 이름만 나열한다.
 */
function renderAttendees(analysis: MeetingAnalysis): string {
  const groups = analysis.attendeeGroups?.filter(g => g.members?.length);
  if (groups?.length) {
    return groups.map(g => `    · ${g.org} : ${g.members.join(', ')}`).join('\n');
  }
  return `    · ${analysis.attendees?.join(', ') || '미지정'}`;
}

/**
 * 양식의 '회의 내용' 칸. □ 대주제 → - 소주제 → Ÿ 세부항목 3단 개조식.
 * contents가 비어 있으면(구조화 실패 또는 짧은 회의) summary 줄글로 대체한다.
 */
function renderContents(analysis: MeetingAnalysis): string {
  const sections = analysis.contents?.filter(c => c.topic);
  if (!sections?.length) return `  ${analysis.summary}`;

  return sections.map(sec => {
    const head = `  □ ${sec.topic}`;
    const body = (sec.subtopics ?? []).map(sub => {
      const name = `    - ${sub.name}`;
      const pts = (sub.points ?? []).map(p => `      Ÿ ${p}`).join('\n');
      return pts ? `${name}\n${pts}` : name;
    }).join('\n');
    return body ? `${head}\n${body}` : head;
  }).join('\n\n');
}

function renderRequests(analysis: MeetingAnalysis): string {
  return analysis.requests?.length
    ? analysis.requests.map(r => `    - ${r}`).join('\n')
    : '    - 없음';
}

export async function sendMeetingResult(analysis: MeetingAnalysis, fileName: string): Promise<void> {
  const datetime = analysis.datetime || '미지정';
  const venue = analysis.venue || '미지정';
  const absentees = analysis.absentees?.length ? analysis.absentees.join(', ') : '미지정';
  const nextMeeting = analysis.nextMeeting || '미지정';
  const nextVenue = analysis.nextVenue || '미지정';
  const author = 'AI Meeting Agent';
  
  const kst = new Date();
  kst.setHours(kst.getHours() + 9);
  const createdDate = kst.toISOString().split('T')[0];

  const decisions = analysis.decisions.length
    ? analysis.decisions.map((d, i) => `  - 결정 ${i + 1} : ${d}`).join('\n')
    : '  - 없음';

  const todos = analysis.todos.length
    ? analysis.todos.map((t, i) => {
        const who = t.assignee ? t.assignee : '미정';
        const when = t.due ? t.due : '미정';
        return `  - Task ${i + 1} : ${t.task} / 담당: ${who} / 기한: ${when}`;
      }).join('\n')
    : '  - 없음';

  const schedules = analysis.schedules.length
    ? analysis.schedules.map((s) => {
        const date = s.date ? ` - ${s.date}` : '';
        return `• ${s.title}${date}`;
      }).join('\n')
    : '없음';

  const qna = analysis.qna?.length
    ? analysis.qna.map((q) => `    - 질문: ${q.question}\n    - 답변: ${q.answer}`).join('\n\n')
    : '    - 없음';

  let summaryText = analysis.summary;
  if (analysis.keyRemarks?.length) {
    summaryText += '\n\n  주요 발언:\n' + analysis.keyRemarks.map(r => `    - ${r}`).join('\n');
  }

  const slackTitle = analysis.title || fileName;
  const attendees = analysis.attendees?.join(', ') || '미지정';
  const agenda = analysis.agenda || '없음';

  // 표준 회의록 양식용 값. 회의 번호는 구글 시트에 기록될 번호와 같은 값을 쓴다
  // (시트 기록이 슬랙 전송보다 뒤에 일어나므로 여기서는 미리보기로 읽는다).
  const meetingNo = peekSequence();
  const attendeeBlock = renderAttendees(analysis);
  const contentsBlock = renderContents(analysis);
  const requestsBlock = renderRequests(analysis);

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
      .replace(/\{\{datetime\}\}/g, datetime)
      .replace(/\{\{venue\}\}/g, venue)
      .replace(/\{\{attendees\}\}/g, attendees)
      .replace(/\{\{meetingNo\}\}/g, meetingNo)
      .replace(/\{\{attendeeGroups\}\}/g, attendeeBlock)
      .replace(/\{\{contents\}\}/g, contentsBlock)
      .replace(/\{\{requests\}\}/g, requestsBlock)
      .replace(/\{\{absentees\}\}/g, absentees)
      .replace(/\{\{agenda\}\}/g, agenda)
      .replace(/\{\{summary\}\}/g, summaryText)
      .replace(/\{\{decisions\}\}/g, decisions)
      .replace(/\{\{todos\}\}/g, todos)
      .replace(/\{\{schedules\}\}/g, schedules)
      .replace(/\{\{qna\}\}/g, qna)
      .replace(/\{\{nextMeeting\}\}/g, nextMeeting)
      .replace(/\{\{nextVenue\}\}/g, nextVenue)
      .replace(/\{\{attachments\}\}/g, '없음 (음성 분석 완료)')
      .replace(/\{\{relatedDocs\}\}/g, '없음')
      .replace(/\{\{author\}\}/g, author)
      .replace(/\{\{createdDate\}\}/g, createdDate)
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
          text: { type: 'plain_text', text: `📋 회 의 록`, emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*회의 번호* : ${meetingNo}`,
              `*제 목* : ${slackTitle}`,
              `*일 시* : ${datetime}`,
              `*장 소* : ${venue}`,
              `*작 성 자* : ${author}`,
              `*참 석 자*`,
              attendeeBlock,
            ].join('\n').substring(0, 2999),
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*회의 내용*\n${contentsBlock}`.substring(0, 2999) },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*□ 요청 및 질의 사항*\n${requestsBlock}`.substring(0, 2999) },
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
