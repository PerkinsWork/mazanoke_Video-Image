# Browser Video Compressor Module

A framework-agnostic, headless video compression helper built around [`@ffmpeg/ffmpeg`](https://github.com/ffmpegwasm/ffmpeg.wasm). The module accepts browser `File` objects, performs compression fully in the browser (WebAssembly), and returns a `Blob` that host apps can download, preview, or upload.

## Installation

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

The host application must serve FFmpeg core assets with proper COOP/COEP headers for SharedArrayBuffer support:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Place FFmpeg core files (e.g., `ffmpeg-core.js`, `ffmpeg-core.wasm`, `ffmpeg-core.worker.js`) under a path you control or rely on the default CDN URLs used by `@ffmpeg/ffmpeg`.
When self-hosting, serve the assets with long-lived caching and the COOP/COEP headers noted above.

## API Overview

Import the module and create an instance:

```js
import { CompressionMode, createVideoCompressor } from './assets/js/video-compressor.js';

const { init, compress } = createVideoCompressor({
  // corePath: '/ffmpeg', // Optional if you self-host the FFmpeg core assets
  onLog: (message) => console.debug(message),
  // Optional advanced hooks for testing/mocking:
  // ffmpegFactory: customCreateFFmpeg,
  // fileFetcher: customFetchFile,
});
```

### Initialization

Call `init()` once early (optional; `compress()` will lazy-load if needed):

```js
await init();
```

### Compression

`compress(file, options)` accepts a browser `File` and returns a `Blob`:

```js
const resultBlob = await compress(file, {
  mode: CompressionMode.REENCODE,
  video: {
    codec: 'libx264',
    crf: 23,
    preset: 'medium',
    scale: { width: 1280 },
  },
  audio: { codec: 'aac', bitrate: '128k' },
  output: { container: 'mp4', mimeType: 'video/mp4' },
  onProgress: (value) => updateProgressBar(value), // 0-1
  onLog: (line) => appendLog(line),
});

// Use the resulting Blob
const url = URL.createObjectURL(resultBlob);
```

### Supported Modes

- `CompressionMode.COPY`: Copy video and audio streams without re-encoding (fast). Adds `-movflags +faststart` for better web playback.
- `CompressionMode.COPY_MUTE`: Copy video as-is and strip audio.
- `CompressionMode.REENCODE`: Re-encode video with configurable codec, CRF/bitrate, preset, scaling, and audio controls (copy, re-encode, or mute).

### Option Reference

- `video.codec`: e.g., `libx264`, `libvpx-vp9`. Defaults to `libx264`.
- `video.crf`: Quality-based encoding (0–51). Mutually exclusive with `video.bitrate`.
- `video.bitrate`: Target bitrate like `1200k`. Mutually exclusive with `video.crf`.
- `video.preset`: Codec speed/quality preset (`ultrafast` … `veryslow`).
- `video.scale`: `{ width?: number, height?: number }`. Missing dimension is auto-calculated to preserve aspect ratio (FFmpeg `-vf scale`).
- `audio.mute`: Boolean to drop audio entirely.
- `audio.codec`: Audio codec (defaults to copy when bitrate is not provided).
- `audio.bitrate`: Bitrate such as `128k`.
- `output.container`: File container/extension without dot (default `mp4`).
- `output.fileName`: Optional explicit output file name.
- `output.mimeType`: MIME type for the returned `Blob` (default `video/mp4`).
- `onProgress(progress)`: Per-job progress callback (0–1).
- `onLog(message)`: Per-job log callback.
- `ffmpegFactory`: (advanced) inject a custom FFmpeg factory, useful for testing/mocking.
- `fileFetcher`: (advanced) inject a custom fetcher to turn a `File` into data for FFmpeg.

### Tests

Run the lightweight unit tests (mocked FFmpeg) via:

```bash
npm install
npm test
```

### Example Integrations

**Copy video and audio without re-encoding**

```js
await compress(file, { mode: CompressionMode.COPY });
```

**Copy video, mute audio**

```js
await compress(file, { mode: CompressionMode.COPY_MUTE });
```

**Full re-encode with scaling and CRF**

```js
await compress(file, {
  mode: CompressionMode.REENCODE,
  video: { codec: 'libx264', crf: 21, preset: 'faster', scale: { width: 1080 } },
  audio: { codec: 'aac', bitrate: '160k' },
  onProgress: (value) => console.log(`Progress: ${(value * 100).toFixed(1)}%`),
  onLog: (line) => console.log(line),
});
```

### Notes and Tips

- Only one job runs per instance at a time. Create multiple instances if you need concurrent jobs.
- When providing both `video.crf` and `video.bitrate`, the compressor will throw an error to avoid conflicting quality strategies.
- Missing FFmpeg assets or invalid files will surface as thrown errors; hook `onLog` for more context.
- Use the returned `Blob` directly for downloads or previews (`URL.createObjectURL`).

