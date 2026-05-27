# huge stage 1 to make the smallest ffmpeg build that only supports webp, libx264, and libx265. 

########################################
# Stage 1 — build minimal static ffmpeg
########################################
FROM debian:bookworm-slim AS ffmpeg-builder

# ── Version pins ─────────────────────────────────────────────────────────────
ARG X265_TAG=3.5
ARG FFMPEG_VERSION=7.1.1

ENV PREFIX=/opt/ffmpeg
ENV PKG_CONFIG_PATH=${PREFIX}/lib/pkgconfig
# pick up CPU count at build time via shell; pass -j later with $(nproc)

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    nasm \
    pkg-config \
    wget \
    ca-certificates \
    libwebp-dev \
    && find /usr/lib -name 'libwebp*.so*' -delete \
    && rm -rf /var/lib/apt/lists/*

# ── libx264 (static, no CLI) ──────────────────────────────────────────────────
# To pin a specific commit later, run the build once, note the SHA printed by
# `git rev-parse HEAD`, then add: && git checkout <SHA>
RUN git clone --depth 1 -b stable \
        https://code.videolan.org/videolan/x264.git /tmp/x264 \
    && cd /tmp/x264 \
    && echo "x264 commit: $(git rev-parse HEAD)" \
    && ./configure \
        --prefix=${PREFIX} \
        --enable-static \
        --disable-shared \
        --disable-opencl \
        --disable-cli \
        --bit-depth=all \
    && make -j$(nproc) install \
    && rm -rf /tmp/x264

# ── libx265 (static, no CLI, 8-bit default build) ─────────────────────────────
# Uses the single-lib cmake pass (8-bit). 10/12-bit support requires a
# multilib build; add -DHIGH_BIT_DEPTH=ON + a second pass if needed.
RUN git clone --depth 1 --branch ${X265_TAG} \
        https://bitbucket.org/multicoreware/x265_git.git /tmp/x265 \
    && cmake -S /tmp/x265/source -B /tmp/x265/build \
        -DCMAKE_INSTALL_PREFIX=${PREFIX} \
        -DENABLE_SHARED=OFF \
        -DENABLE_CLI=OFF \
        -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/x265/build -j$(nproc) \
    && cmake --install /tmp/x265/build \
    && rm -rf /tmp/x265

# ── ffmpeg (minimal static-codec / dynamic-glibc binary) ──────────────────────
# Note: --enable-static here means "build static libav* archives"; the
# resulting ffmpeg/ffprobe executables still link glibc dynamically (correct
# for Debian-based runtime images). Full glibc-static linking is tricky and
# not needed here since bun:1-slim ships glibc.
RUN wget -qO /tmp/ffmpeg.tar.xz \
        https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz \
    && tar xf /tmp/ffmpeg.tar.xz -C /tmp \
    && cd /tmp/ffmpeg-${FFMPEG_VERSION} \
    && ./configure \
        --prefix=${PREFIX} \
        --pkg-config-flags="--static" \
        --extra-cflags="-I${PREFIX}/include" \
        --extra-ldflags="-L${PREFIX}/lib" \
        --extra-libs="-lpthread -lm -lstdc++" \
        \
        --enable-gpl \
        --enable-libx264 \
        --enable-libx265 \
        --enable-static \
        --disable-shared \
        --disable-everything \
        --disable-autodetect \
        --disable-network \
        --disable-debug \
        --enable-small \
        --disable-doc \
        --disable-manpages \
        --disable-htmlpages \
        --disable-podpages \
        --disable-txtpages \
        --disable-ffplay \
        \
        --enable-decoder=h264 \
        --enable-decoder=hevc \
        --enable-decoder=vp8 \
        --enable-decoder=vp9 \
        --enable-decoder=av1 \
        --enable-decoder=mpeg4 \
        --enable-decoder=mpeg1video \
        --enable-decoder=mpeg2video \
        --enable-decoder=h263 \
        --enable-decoder=wmv3 \
        --enable-decoder=theora \
        --enable-decoder=mjpeg \
        --enable-decoder=png \
        --enable-decoder=webp \
        --enable-decoder=rawvideo \
        \
        --enable-libwebp \
        --enable-encoder=libx264 \
        --enable-encoder=libx265 \
        --enable-encoder=libwebp \
        --enable-encoder=libwebp_anim \
        --enable-encoder=mjpeg \
        --enable-encoder=png \
        --enable-encoder=rawvideo \
        \
        --enable-muxer=mp4 \
        --enable-muxer=mov \
        --enable-muxer=matroska \
        --enable-muxer=webm \
        --enable-muxer=avi \
        --enable-muxer=mpegts \
        --enable-muxer=flv \
        --enable-muxer=image2 \
        --enable-muxer=webp \
        --enable-muxer=null \
        --enable-muxer=rawvideo \
        \
        --enable-demuxer=mov \
        --enable-demuxer=matroska \
        --enable-demuxer=avi \
        --enable-demuxer=mpegts \
        --enable-demuxer=flv \
        --enable-demuxer=image2 \
        --enable-demuxer=webp \
        --enable-demuxer=concat \
        --enable-demuxer=rawvideo \
        --enable-demuxer=h264 \
        --enable-demuxer=hevc \
        --enable-demuxer=m4v \
        --enable-demuxer=mpeg \
        --enable-demuxer=ivf \
        --enable-demuxer=ogg \
        \
        --enable-protocol=file \
        --enable-protocol=pipe \
        --enable-protocol=concat \
        \
        --enable-parser=h264 \
        --enable-parser=hevc \
        --enable-parser=vp8 \
        --enable-parser=vp9 \
        --enable-parser=av1 \
        --enable-parser=mpeg4video \
        --enable-parser=mjpeg \
        --enable-parser=png \
        \
        --enable-bsf=h264_mp4toannexb \
        --enable-bsf=hevc_mp4toannexb \
        --enable-bsf=null \
        \
        --enable-filter=scale \
        --enable-filter=format \
        --enable-filter=fps \
        --enable-filter=crop \
        --enable-filter=trim \
        --enable-filter=setpts \
        --enable-filter=select \
        --enable-filter=concat \
        --enable-filter=thumbnail \
        --enable-filter=null \
        --enable-filter=setsar \
        --enable-filter=setdar \
        --enable-filter=pad \
        --enable-filter=color \
    && make -j$(nproc) install \
    && strip ${PREFIX}/bin/ffmpeg ${PREFIX}/bin/ffprobe \
    && rm -rf /tmp/ffmpeg-${FFMPEG_VERSION} /tmp/ffmpeg.tar.xz

# Sanity-check inside the builder (fails the build if anything is wrong)
RUN echo "=== ffmpeg ===" \
    && ${PREFIX}/bin/ffmpeg -version \
    && echo "=== ffprobe ===" \
    && ${PREFIX}/bin/ffprobe -version \
    && echo "=== encoders ===" \
    && ${PREFIX}/bin/ffmpeg -encoders 2>/dev/null | grep -E 'libx264|libx265|libwebp' \
    && echo "=== binary sizes ===" \
    && ls -lh ${PREFIX}/bin/ffmpeg ${PREFIX}/bin/ffprobe

########################################
# Stage 2 — frontend build
########################################
FROM docker.io/oven/bun:1-slim AS frontend-build
WORKDIR /app
COPY package.json bun.lock* ./
COPY packages/types/package.json ./packages/types/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN bun install --frozen-lockfile
COPY packages/types ./packages/types
COPY frontend ./frontend
RUN bun run --cwd frontend build

########################################
# Stage 3 — backend deps (backend + @repo/types only; no frontend packages or devDeps)
########################################
FROM docker.io/oven/bun:1-slim AS backend-deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY packages/types/package.json ./packages/types/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN bun install --frozen-lockfile --production --filter=backend

########################################
# Stage 4 — runtime
########################################
FROM docker.io/oven/bun:1-slim AS runtime

# Copy both binaries (ffmpeg multicall/argv[0] trick doesn't apply to ffmpeg;
# ffmpeg and ffprobe are separate programs sharing no runtime dispatch logic)
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffmpeg  /usr/local/bin/ffmpeg
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe

WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=backend-deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY packages/types ./packages/types
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV STATIC_DIR=/app/frontend/dist
EXPOSE 3000
CMD ["bun", "backend/src/main.ts"]
