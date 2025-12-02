import * as ffmpegModule from '@ffmpeg/ffmpeg';
import * as utilModule from '@ffmpeg/util';

const { createFFmpeg } = ffmpegModule;
const { fetchFile } = utilModule;

/**
 * Compression modes supported by the VideoCompressor.
 * @readonly
 * @enum {"copy" | "copy-mute" | "reencode"}
 */
export const CompressionMode = Object.freeze({
  COPY: 'copy',
  COPY_MUTE: 'copy-mute',
  REENCODE: 'reencode',
});

/**
 * @typedef {Object} VideoCompressorConfig
 * @property {string} [corePath] Optional path where ffmpeg-core.js/wasm/worker assets are hosted. If omitted, the default
 * FFmpeg CDN path is used.
 * @property {(message: string) => void} [onLog] Global log handler used when a per-job handler is not provided.
 * @property {(progress: number) => void} [onProgress] Global progress handler used when a per-job handler is not provided.
 * @property {boolean} [log] Whether to forward ffmpeg internal logs. Defaults to true.
 * @property {typeof createFFmpeg} [ffmpegFactory] Factory used to create an FFmpeg instance. Defaults to `createFFmpeg` (primarily useful for testing/mocking).
 * @property {(input: File) => Promise<Uint8Array>} [fileFetcher] Function that turns a File into data consumable by FFmpeg. Defaults to `fetchFile`.
 */

/**
 * @typedef {Object} ScaleOptions
 * @property {number} [width] Desired output width. Use together with height to force exact size, or alone to keep aspect ratio.
 * @property {number} [height] Desired output height. Use together with width to force exact size, or alone to keep aspect ratio.
 */

/**
 * @typedef {Object} VideoOptions
 * @property {string} [codec] Video codec to use when re-encoding (e.g., "libx264", "libvpx-vp9"). Defaults to "libx264".
 * @property {number} [crf] Constant Rate Factor for quality-based encoding (0-51, lower is better). Mutually exclusive with bitrate.
 * @property {string} [bitrate] Target video bitrate (e.g., "1200k"). Mutually exclusive with crf.
 * @property {string} [preset] Preset for codec speed/quality trade-off (e.g., "ultrafast", "medium", "slow").
 * @property {ScaleOptions} [scale] Optional scaling configuration.
 */

/**
 * @typedef {Object} AudioOptions
 * @property {boolean} [mute] If true, remove audio entirely.
 * @property {string} [codec] Audio codec (e.g., "aac", "libopus"). Defaults to "copy" unless bitrate/codec provided.
 * @property {string} [bitrate] Target audio bitrate (e.g., "128k").
 */

/**
 * @typedef {Object} OutputOptions
 * @property {string} [container] File container/extension without dot (e.g., "mp4", "webm"). Defaults to "mp4".
 * @property {string} [fileName] Override output file name (should include extension). Defaults to generated name.
 * @property {string} [mimeType] MIME type for the resulting Blob. Defaults to "video/mp4".
 */

/**
 * @typedef {Object} CompressionOptions
 * @property {keyof typeof CompressionMode} mode Compression mode to use.
 * @property {VideoOptions} [video] Video-related options.
 * @property {AudioOptions} [audio] Audio-related options.
 * @property {OutputOptions} [output] Output configuration.
 * @property {(progress: number) => void} [onProgress] Per-job progress handler (0-1).
 * @property {(message: string) => void} [onLog] Per-job log handler.
 */

/**
 * A reusable browser-based video compressor powered by FFmpeg WebAssembly.
 * The instance can be reused across multiple compression calls.
 */
export class VideoCompressor {
  /**
   * @param {VideoCompressorConfig} [config]
   */
  constructor(config = {}) {
    this.config = {
      corePath: undefined,
      log: true,
      ffmpegFactory: createFFmpeg,
      fileFetcher: fetchFile,
      ...config,
    };
    this.ffmpeg = null;
    this.loadingPromise = null;
    this.activeJobHooks = { onLog: null, onProgress: null };
    this.isRunningJob = false;
  }

  /**
   * Initialize FFmpeg and load core assets once.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.ffmpeg) {
      return;
    }
    if (!this.loadingPromise) {
      const ffmpegOptions = { log: this.config.log };
      if (this.config.corePath) {
        ffmpegOptions.corePath = this.config.corePath;
      }
      this.ffmpeg = this.config.ffmpegFactory(ffmpegOptions);
      this.ffmpeg.on('log', ({ message }) => this.#forwardLog(message));
      this.ffmpeg.on('progress', ({ progress }) => this.#forwardProgress(progress));
      this.loadingPromise = this.ffmpeg.load();
    }
    await this.loadingPromise;
  }

  /**
   * Compress the provided video file according to the chosen mode and options.
   * @param {File} file Browser File object representing the input video.
   * @param {CompressionOptions} options Compression options controlling behavior.
   * @returns {Promise<Blob>} Compressed video as a Blob.
   */
  async compress(file, options) {
    if (!(file instanceof File)) {
      throw new Error('Input must be a browser File object.');
    }
    if (!options || !options.mode) {
      throw new Error('Compression mode is required.');
    }
    if (this.isRunningJob) {
      throw new Error('Another compression job is already running on this instance.');
    }

    await this.init();
    this.activeJobHooks = {
      onLog: options.onLog || this.config.onLog || null,
      onProgress: options.onProgress || this.config.onProgress || null,
    };

    const output = { container: 'mp4', mimeType: 'video/mp4', ...options.output };
    const inputExtension = this.#guessExtension(file.name, file.type);
    const inputName = `input-${Date.now()}.${inputExtension}`;
    const outputName = output.fileName || `output-${Date.now()}.${output.container}`;
    const args = this.#buildArgs(inputName, outputName, options, output);

    await this.ffmpeg.writeFile(inputName, await this.config.fileFetcher(file));
    this.isRunningJob = true;
    try {
      await this.ffmpeg.exec(args);
      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([data], { type: output.mimeType });
    } finally {
      this.isRunningJob = false;
      this.activeJobHooks = { onLog: null, onProgress: null };
      this.#cleanupFiles([inputName, outputName]);
    }
  }

  #cleanupFiles(paths) {
    paths.forEach((path) => {
      try {
        if (this.ffmpeg?.FS('stat', path)) {
          this.ffmpeg.FS('unlink', path);
        }
      } catch (_) {
        // Ignore cleanup errors.
      }
    });
  }

  #forwardLog(message) {
    if (this.activeJobHooks.onLog) {
      this.activeJobHooks.onLog(message);
    }
  }

  #forwardProgress(progress) {
    if (this.activeJobHooks.onProgress) {
      this.activeJobHooks.onProgress(progress);
    }
  }

  #guessExtension(name, mime) {
    if (name.includes('.')) {
      return name.split('.').pop();
    }
    const mimeParts = mime ? mime.split('/') : [];
    return mimeParts[1] || 'mp4';
  }

  #buildArgs(inputName, outputName, options, output) {
    const args = ['-i', inputName];

    switch (options.mode) {
      case CompressionMode.COPY:
        args.push('-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart');
        break;
      case CompressionMode.COPY_MUTE:
        args.push('-c:v', 'copy', '-an', '-movflags', '+faststart');
        break;
      case CompressionMode.REENCODE:
        this.#applyVideoOptions(args, options.video);
        this.#applyAudioOptions(args, options.audio);
        args.push('-movflags', '+faststart');
        break;
      default:
        throw new Error(`Unsupported compression mode: ${options.mode}`);
    }

    args.push('-y', outputName);
    return args;
  }

  #applyVideoOptions(args, videoOptions = {}) {
    const {
      codec = 'libx264',
      crf,
      bitrate,
      preset,
      scale,
    } = videoOptions;

    args.push('-c:v', codec);

    if (crf !== undefined && bitrate !== undefined) {
      throw new Error('Provide either crf or bitrate for video, not both.');
    }

    if (crf !== undefined) {
      args.push('-crf', String(crf));
    }
    if (bitrate !== undefined) {
      args.push('-b:v', String(bitrate));
    }
    if (preset) {
      args.push('-preset', preset);
    }
    if (scale && (scale.width || scale.height)) {
      const width = scale.width ?? -2;
      const height = scale.height ?? -2;
      args.push('-vf', `scale=${width}:${height}`);
    }
  }

  #applyAudioOptions(args, audioOptions = {}) {
    if (audioOptions.mute) {
      args.push('-an');
      return;
    }

    const { codec, bitrate } = audioOptions;

    if (codec) {
      args.push('-c:a', codec);
    } else if (bitrate) {
      args.push('-c:a', 'aac');
    } else {
      args.push('-c:a', 'copy');
    }

    if (bitrate) {
      args.push('-b:a', String(bitrate));
    }
  }
}

/**
 * Factory helper for ergonomic creation.
 * @param {VideoCompressorConfig} [config]
 * @returns {{ compress: (file: File, options: CompressionOptions) => Promise<Blob>, init: () => Promise<void>, instance: VideoCompressor }}
 */
export function createVideoCompressor(config = {}) {
  const instance = new VideoCompressor(config);
  return {
    instance,
    init: () => instance.init(),
    compress: (file, options) => instance.compress(file, options),
  };
}

