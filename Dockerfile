# ── 빌드 스테이지 ────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=2048"

# better-sqlite3 때문에 필요하다. 이 패키지는 binding.gyp를 갖고 있고 install 스크립트가
# 없어서, npm이 기본 동작으로 `node-gyp rebuild`를 돌린다. binding.gyp 자체는 동봉된
# prebuild(linuxmusl-x64)를 감지하면 아무것도 빌드하지 않도록 되어 있지만, 그 판단을
# 하려면 node-gyp가 gyp 파일을 해석해야 하고 거기에 python3가 필요하다.
# 없으면 "Could not find any Python installation" 으로 npm ci 단계에서 죽는다.
RUN apk add --no-cache python3 make g++

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
# 여기서도 node-gyp가 돌기 때문에 python3가 필요하다. 다만 실행 이미지에 툴체인을
# 남겨둘 이유가 없으므로 가상 패키지로 묶어 설치 직후 같은 레이어에서 지운다.
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    apk del .build-deps

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
