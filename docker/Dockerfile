# Isolated Facebook scraper worker: Chrome + Xvfb + noVNC + existing CLI.
# On Apple Silicon, compose sets platform: linux/amd64 (Chrome .deb is amd64-only).
FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCRAPE_PROFILE_ROOT_DIR=/data/profiles \
    SCRAPE_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable \
    SCRAPE_ARTIFACT_ROOT_DIR=/data/artifacts \
  # Slightly slower navigation reduces burst traffic from many workers.
    SCRAPE_WAIT_AFTER_NAVIGATION_MS=4000 \
    NOVNC_PORT=6080 \
    VNC_PORT=5900

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg wget \
    xvfb x11-utils x11vnc fluxbox wmctrl xdotool xterm \
    novnc websockify \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install ffmpeg

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# tsc does not emit the profile scraper's injected browser scripts (.js) — copy into dist.
RUN mkdir -p dist/facebook/scrapers/profile/browser \
  && cp src/facebook/scrapers/profile/browser/*.js dist/facebook/scrapers/profile/browser/

# sqlite3 CLI — the session gate reads the Chrome cookie store to check for a signed-in session.
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*

COPY docker/entrypoint.sh docker/start-display.sh docker/focus-chrome.sh docker/fluxbox-init /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/start-display.sh /usr/local/bin/focus-chrome.sh \
  && mkdir -p /root/.fluxbox \
  && cp /usr/local/bin/fluxbox-init /root/.fluxbox/init

RUN mkdir -p /data/profiles /data/artifacts

VOLUME ["/data/profiles", "/data/artifacts"]

EXPOSE 6080 5900

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["help"]
