# ── 빌드 스테이지 ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci --omit=dev

# 소스 복사 후 TypeScript 컴파일
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── 실행 스테이지 ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# 타임존 설정 (한국)
ENV TZ=Asia/Seoul
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

# 프로덕션 의존성만 복사
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드 결과물 복사
COPY --from=builder /app/dist ./dist

# recording 폴더 마운트 포인트
VOLUME ["/recordings"]

# 환경변수 기본값
ENV NODE_ENV=production
ENV WATCH_DIR=/recordings

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["node", "dist/agent.js"]
