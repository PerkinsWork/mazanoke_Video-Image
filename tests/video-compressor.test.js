import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CompressionMode, VideoCompressor } from '../assets/js/video-compressor.js';

const TestFile = typeof File !== 'undefined'
  ? File
  : class extends Blob {
      constructor(chunks, name, options = {}) {
        super(chunks, options);
        this.name = name;
        this.lastModified = Date.now();
      }
    };

class StubFFmpeg {
  constructor() {
    this.listeners = { log: [], progress: [] };
    this.writtenFiles = new Map();
    this.execArgs = null;
  }

  on(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event].push(handler);
    }
  }

  async load() {}

  async writeFile(name, data) {
    this.writtenFiles.set(name, data);
  }

  async exec(args) {
    this.execArgs = args;
    // Simulate a progress event mid-run.
    this.listeners.progress.forEach((handler) => handler({ progress: 0.5 }));
  }

  async readFile(name) {
    const fromWrite = this.writtenFiles.get(name);
    return fromWrite ?? new Uint8Array([1, 2, 3]);
  }

  FS(_op, _path) {
    return true;
  }
}

function createStubFFmpeg() {
  return new StubFFmpeg();
}

const fileData = new Uint8Array([0]);
const videoFile = new TestFile([fileData], 'sample.mp4', { type: 'video/mp4' });

test('builds correct args for copy mode and forwards progress', async () => {
  const stub = createStubFFmpeg();
  let progressUpdate = null;

  const compressor = new VideoCompressor({
    ffmpegFactory: () => stub,
    fileFetcher: async () => fileData,
  });

  await compressor.compress(videoFile, {
    mode: CompressionMode.COPY,
    onProgress: (value) => {
      progressUpdate = value;
    },
  });

  assert.ok(Array.isArray(stub.execArgs));
  assert.ok(stub.execArgs.includes('-c:v') && stub.execArgs.includes('copy'));
  assert.ok(stub.execArgs.includes('-c:a') && stub.execArgs.includes('copy'));
  assert.ok(stub.execArgs.includes('-movflags') && stub.execArgs.includes('+faststart'));
  assert.equal(progressUpdate, 0.5);
});

test('throws when both crf and bitrate are provided', async () => {
  const compressor = new VideoCompressor({
    ffmpegFactory: createStubFFmpeg,
    fileFetcher: async () => fileData,
  });

  await assert.rejects(
    () =>
      compressor.compress(videoFile, {
        mode: CompressionMode.REENCODE,
        video: { crf: 20, bitrate: '1M' },
      }),
    /either crf or bitrate/
  );
});
