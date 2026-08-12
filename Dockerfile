# ── 빌드 스테이지 ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=2048"

# 네이티브 모듈(node-gyp 빌드가 필요한 의존성)은 두지 않는다.
# 그런 걸 추가하면 alpine에는 python3/make/g++가 없어 npm ci가 실패하므로,
# 여기에 빌드 도구를 넣기 전에 그 의존성이 정말 필요한지 먼저 따져볼 것.

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci

# 소스 복사 후 TypeScript 컴파일
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# 대시보드 빌드
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# ── 실행 스테이지 ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# 타임존 설정 (한국) 및 ffmpeg 설치
ENV TZ=Asia/Seoul
RUN apk add --no-cache tzdata ffmpeg && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# 프로덕션 의존성만 복사
COPY package*.json ./
RUN npm ci --omit=dev

# 백엔드 빌드 결과물 복사
COPY --from=builder /app/dist ./dist

# 프론트엔드 대시보드 결과물 복사
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# 웹 포트 노출
EXPOSE 3000

# recording 폴더 마운트 포인트
VOLUME ["/recordings"]

# 환경변수 기본값
ENV NODE_ENV=production
ENV WATCH_DIR=/recordings

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${DASHBOARD_PORT:-3000}/healthz" || exit 1

CMD ["node", "dist/agent.js"]
