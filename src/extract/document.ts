import fs from 'fs';
import path from 'path';

// 문서 라이브러리는 쓸 때만 불러온다. 최상단에 두면 봇이 기동할 때마다 전부 로딩되는데,
// 회의 녹음만 처리하는 평소에는 하나도 필요 없다. 실제로 pdfjs 를 기동 경로에 올렸다가
// 컨테이너가 SIGILL(exit 132)로 죽어 봇 전체가 멈춘 적이 있다 — 문서 한 종류가 이 CPU에서
// 안 돌더라도 나머지 기능까지 같이 죽는 구조여선 안 된다.

/**
 * 문서에서 텍스트를 뽑는다. 주간보고를 읽어 액션아이템을 도출하기 위한 앞단이다.
 *
 * 한글(.hwp)은 지원하지 않는다. 파싱 자체는 되지만 본문 텍스트만 나오고 표 안이 비는데,
 * 한글 보고서는 내용 대부분이 표에 들어있어 껍데기만 읽히기 때문이다.
 * (실제 주간보고 26쪽을 뽑아보니 제목만 2,374자 나왔다.)
 * 같은 문서를 PDF로 저장하면 표 내용까지 온전히 나온다.
 */

export interface ExtractedDocument {
  text: string;
  pages?: number;
  format: string;
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.hwpx'] as const;

export function isSupportedDocument(fileName: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(path.extname(fileName).toLowerCase());
}

export async function extractDocumentText(filePath: string): Promise<ExtractedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  switch (ext) {
    case '.pdf':  return extractPdf(buf);
    case '.docx': return extractDocx(buf);
    case '.pptx': return extractPptx(buf);
    case '.hwpx': return extractHwpx(buf);
    case '.hwp':
      throw new Error(
        '한글(.hwp)은 표 안의 내용이 추출되지 않아 지원하지 않습니다. ' +
        '한글에서 [파일 → 다른 이름으로 저장 → PDF]로 저장한 뒤 올려주세요.'
      );
    default:
      throw new Error(`지원하지 않는 형식입니다: ${ext} (지원: ${SUPPORTED_EXTENSIONS.join(', ')})`);
  }
}

/**
 * PDF. 조각난 텍스트를 y좌표로 묶어 줄을 복원한다.
 * 그냥 이어붙이면 표가 한 줄로 뭉개져서 무슨 값이 어느 칸인지 알 수 없게 된다.
 */
async function extractPdf(buf: Buffer): Promise<ExtractedDocument> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const lines = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const y = Math.round((item as any).transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x: (item as any).transform[4], s: item.str });
    }

    const text = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])                                   // 위 → 아래
      .map(([, parts]) =>
        parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');

    pages.push(`--- ${i}쪽 ---\n${text}`);
  }

  return { text: pages.join('\n\n'), pages: doc.numPages, format: 'PDF' };
}

/** DOCX. mammoth 가 표를 줄바꿈으로 펼쳐준다. */
async function extractDocx(buf: Buffer): Promise<ExtractedDocument> {
  const { default: mammoth } = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return { text: value.trim(), format: 'Word' };
}

/** PPTX 는 슬라이드마다 XML 이 하나씩 든 zip 이다. <a:t> 안에 글자가 들어있다. */
async function extractPptx(buf: Buffer): Promise<ExtractedDocument> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);

  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string');
    const text = collectTags(xml, 'a:t').join('\n');
    slides.push(`--- ${slideNumber(name)}번 슬라이드 ---\n${text}`);
  }

  return { text: slides.join('\n\n'), pages: slideNames.length, format: 'PowerPoint' };
}

/** HWPX 는 HWP 의 XML 판이라 zip 을 풀어 읽으면 된다 (바이너리 .hwp 와 다르다). */
async function extractHwpx(buf: Buffer): Promise<ExtractedDocument> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);

  const sectionNames = Object.keys(zip.files)
    .filter(n => /Contents\/section\d+\.xml$/i.test(n))
    .sort();

  const parts: string[] = [];
  for (const name of sectionNames) {
    const xml = await zip.files[name].async('string');
    // hp:t 가 본문 글자다. 표 안의 글자도 같은 태그로 들어있다.
    parts.push(collectTags(xml, 'hp:t').join('\n'));
  }

  return { text: parts.join('\n').trim(), pages: sectionNames.length, format: 'HWPX' };
}

function slideNumber(name: string): number {
  return Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

/** XML 에서 특정 태그의 텍스트만 순서대로 모은다. */
function collectTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const t = decodeXml(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');   // 마지막에 처리해야 &amp;lt; 가 깨지지 않는다
}
