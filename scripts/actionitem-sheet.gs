/**
 * ActionItem_run 시트용 Apps Script.
 *
 * ⚠️ 이미 있는 today.gs 를 덮어쓰지 마세요. 그 파일이 정렬과 색칠을 담당합니다.
 *    Apps Script 편집기에서 파일을 새로 만들어(actionitem) 여기에 붙여넣으세요.
 *
 * 두 가지를 한다:
 *   GET  — 기존 행과 분류 값 목록을 돌려준다 (중복 판정 + 구분/팀구분 목록의 씨앗)
 *   POST — 도출된 액션아이템을 행으로 덧붙인다
 *
 * 행/열 위치는 여기에 박아두지 않는다. 헤더 행을 '작업내용' 열로 찾아내고 값은
 * 열 이름으로 배치한다 — 열을 지우거나 옮겨도 따라간다.
 * (today.gs 는 startRow=5, I~S열 같은 숫자를 박아둬서, 열을 지운 뒤 어긋난 상태다.)
 *
 * 배포 방법은 scripts/README-actionitem-sheet.md 참고.
 */

// ── 설정 ────────────────────────────────────────────────────────
// 아무나 시트에 쓰지 못하도록 하는 공유 비밀번호.
// 아래 값을 길고 무작위한 문자열로 바꾸고, 같은 값을 NAS 의 .env 에
// ACTIONITEM_SHEET_TOKEN 으로 넣으세요.
const TOKEN = '여기를_길고_무작위한_문자열로_바꾸세요';

const SHEET_NAME = '시트1';   // 탭 이름. 다르면 여기를 고치세요.

// 날짜로 저장해야 하는 열. 문자열로 넣으면 TODAY() 비교가 안 돼서
// "오늘이 기간에 포함되면 파란색" 조건부 서식이 동작하지 않는다.
const DATE_COLUMNS = ['시작일', '종료일'];

// ── 조회 ────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const info = readSheet_();
    const limit = Number((e && e.parameter && e.parameter.limit) || 0);
    const rows = limit > 0 ? info.rows.slice(-limit) : info.rows;

    return json_({
      ok: true,
      headers: info.headers,
      rows: rows,
      // 분류 값 목록. 대시보드가 이걸 씨앗으로 삼아 목록을 만든다.
      categories: distinct_(info.rows, '구분'),
      teams: distinct_(info.rows, '팀구분'),
      statuses: distinct_(info.rows, '상태')
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── 추가 ────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (body.token !== TOKEN) {
      return json_({ ok: false, error: '토큰이 일치하지 않습니다.' });
    }

    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return json_({ ok: false, error: 'items 배열이 필요합니다.' });
    }

    const info = readSheet_();
    const sheet = info.sheet;

    // 헤더 이름으로 값을 배치한다. 열 순서가 바뀌어도 엉뚱한 칸에 들어가지 않는다.
    const rows = items.map(function (item) {
      return info.headers.map(function (h) {
        const v = item[h];
        if (v === undefined || v === null || v === '') return '';
        return DATE_COLUMNS.indexOf(h) >= 0 ? toDate_(v) : v;
      });
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, info.headers.length).setValues(rows);

    return json_({ ok: true, added: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── 도우미 ──────────────────────────────────────────────────────

/** 헤더 행을 찾아 시트를 객체 배열로 읽는다. */
function readSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + SHEET_NAME);

  const values = sheet.getDataRange().getValues();

  // 헤더가 몇 번째 줄인지 찾는다 (제목 줄이 위에 있을 수 있어 고정하지 않는다)
  let headerRow = -1;
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    if (values[i].indexOf('작업내용') >= 0) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error('헤더 행을 찾지 못했습니다 (작업내용 열이 있어야 합니다).');

  const headers = values[headerRow].map(function (h) { return String(h).trim(); });

  const rows = [];
  for (let i = headerRow + 1; i < values.length; i++) {
    const row = values[i];
    if (row.join('').trim() === '') continue;   // 빈 줄 건너뜀

    const obj = {};
    headers.forEach(function (h, j) {
      if (h) obj[h] = formatCell_(row[j]);
    });
    rows.push(obj);
  }

  return { sheet: sheet, headers: headers, rows: rows };
}

/** 날짜 셀은 YYYY-MM-DD 문자열로 내보낸다 (JSON 으로 오갈 때 시간대에 흔들리지 않게). */
function formatCell_(v) {
  if (v instanceof Date) {
    // 시트는 '시각만 있는 값'(9:30 같은 것)을 1899-12-30 을 기준으로 저장한다.
    // 연도로 구분하지 않으면 시작시간이 전부 "1899-12-30" 이 되어 시각이 사라진다.
    if (v.getFullYear() < 1900) {
      return Utilities.formatDate(v, 'Asia/Seoul', 'HH:mm');
    }
    return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : String(v).trim();
}

/** 'YYYY-MM-DD' 를 시트가 날짜로 인식하는 Date 로 바꾼다. 형식이 다르면 원본을 그대로 둔다. */
function toDate_(v) {
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 특정 열에 실제로 쓰이고 있는 값들을 중복 없이 모은다. */
function distinct_(rows, key) {
  const seen = {};
  const out = [];
  rows.forEach(function (r) {
    const v = (r[key] || '').trim();
    if (v && !seen[v]) { seen[v] = true; out.push(v); }
  });
  return out.sort();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
