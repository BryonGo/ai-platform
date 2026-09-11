# Nuxt SSR 生产镜像。
#
# 与 Go API 的更新方式不同：API 是「本地交叉编译 → scp 二进制 → 重启容器」，
# 而 Nuxt 必须在容器里构建（需要 Node 工具链，且产物是 .output 目录），
# 所以本地无 docker 时，这一步在服务器上 docker build 完成。
#
# 运行时可下发的配置（见 nuxt.config.ts 的 runtimeConfig）：
#   NUXT_API_BASE_INTERNAL  SSR 用的内网 API 地址（私有，不下发浏览器）
#   NUXT_PUBLIC_API_BASE    浏览器用的 API 基址；留空 = 同源 /api/v1（由本服务代理）
#   API_PROXY               Nitro 代理 /api/v1/** 的目标（内网地址）
FROM node:22-alpine AS build
WORKDIR /app
# 先只拷贝依赖清单，让依赖层可缓存
COPY package.json package-lock.json ./
# 用 npm install 而非 npm ci：本仓库的 package-lock 与依赖树不一致
# （cac 锁里是 7.0.0，树里要 6.7.14；npm ci 会以 EUSAGE 直接拒绝），
# 且本地 npm 与 node:22-alpine 自带 npm 版本不同、--package-lock-only 也修不齐。
# 取舍：构建可复现性下降，但能稳定出镜像；若要严格锁版本，需用同一 npm 版本
# 重新生成锁文件后改回 npm ci。
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
# .output 自带独立的 server 与依赖，运行阶段不需要 node_modules
COPY --from=build /app/.output ./.output
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
