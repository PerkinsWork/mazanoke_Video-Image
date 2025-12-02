import { CompressionMode, createVideoCompressor } from './video-compressor.js';

const videoUI = {
  dropZone: document.getElementById('videoCompressDropZone'),
  actions: document.getElementById('videoDropZoneActions'),
  browseButton: document.getElementById('videoBrowseButton'),
  input: document.getElementById('compressVideo'),
  modeSelect: document.getElementById('videoModeSelect'),
  progress: {
    container: document.getElementById('videoProgressContainer'),
    bar: document.getElementById('videoProgressBar'),
    text: document.getElementById('videoProgressText'),
    status: document.getElementById('videoStatus'),
  },
  log: {
    container: document.getElementById('videoLogContainer'),
    output: document.getElementById('videoLog'),
  },
  output: {
    container: document.getElementById('videoOutputContainer'),
    preview: document.getElementById('videoPreview'),
    download: document.getElementById('videoDownload'),
  },
};

const { compress, init } = createVideoCompressor({
  corePath: '/ffmpeg',
  onProgress: updateProgress,
  onLog: appendLog,
});

let isProcessing = false;
let objectUrl = null;

function updateProgress(progress = 0) {
  if (!videoUI.progress.container) return;
  videoUI.progress.container.classList.remove('hidden');
  videoUI.progress.bar.style.width = `${Math.floor(progress * 100)}%`;
  videoUI.progress.text.dataset.progress = `${Math.floor(progress * 100)}`;
  videoUI.progress.text.innerText = `${Math.floor(progress * 100)}%`;
}

function appendLog(message) {
  if (!videoUI.log.output) return;
  videoUI.log.container.classList.remove('hidden');
  const trimmed = message?.trim();
  if (!trimmed) return;
  videoUI.log.output.textContent = `${videoUI.log.output.textContent}${trimmed}\n`;
}

function setStatus(message) {
  if (videoUI.progress.status) {
    videoUI.progress.status.textContent = message;
  }
}

function resetUI() {
  updateProgress(0);
  setStatus('');
  if (videoUI.log.output) {
    videoUI.log.output.textContent = '';
    videoUI.log.container.classList.add('hidden');
  }
}

function setOutput(blob, fileName) {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
  objectUrl = URL.createObjectURL(blob);
  videoUI.output.preview.src = objectUrl;
  videoUI.output.download.href = objectUrl;
  videoUI.output.download.download = fileName;
  videoUI.output.container.classList.remove('hidden');
}

function buildOutputName(file, mode) {
  const nameParts = file.name.split('.');
  const base = nameParts.slice(0, -1).join('.') || nameParts[0];
  const suffix = mode === CompressionMode.REENCODE ? 'reencoded' : 'compressed';
  return `${base}-${suffix}.mp4`;
}

async function handleVideoFile(file) {
  if (!file || isProcessing) return;
  isProcessing = true;
  resetUI();
  setStatus('Loading FFmpeg core...');

  await init();

  const mode = videoUI.modeSelect.value;
  const outputName = buildOutputName(file, mode);

  const options = {
    mode,
    output: { fileName: outputName, mimeType: 'video/mp4' },
    onProgress: updateProgress,
    onLog: appendLog,
  };

  if (mode === CompressionMode.REENCODE) {
    options.video = { codec: 'libx264', crf: 23, preset: 'medium' };
    options.audio = { bitrate: '128k' };
    setStatus('Re-encoding video for smaller size...');
  } else if (mode === CompressionMode.COPY_MUTE) {
    options.audio = { mute: true };
    setStatus('Copying streams and muting audio...');
  } else {
    setStatus('Copying video and audio streams...');
  }

  try {
    const blob = await compress(file, options);
    setOutput(blob, outputName);
    setStatus('Video ready to download or preview.');
  } catch (error) {
    setStatus(`Video compression failed: ${error.message}`);
  } finally {
    isProcessing = false;
  }
}

function handleFileList(fileList) {
  if (!fileList?.length) return;
  handleVideoFile(fileList[0]);
}

function initVideoDropZone() {
  const toggleDragging = (add) => videoUI.dropZone.classList.toggle('drop-zone--is-dragging', add);

  videoUI.actions.addEventListener('click', () => videoUI.input.click());
  videoUI.browseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    videoUI.input.click();
  });

  videoUI.input.addEventListener('change', () => {
    handleFileList(videoUI.input.files);
    videoUI.input.value = '';
  });

  videoUI.dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    toggleDragging(true);
  });

  videoUI.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    toggleDragging(true);
  });

  videoUI.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    toggleDragging(false);
  });

  videoUI.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    toggleDragging(false);
    if (isProcessing) return;
    if (e.dataTransfer?.files?.length) {
      handleFileList(e.dataTransfer.files);
    }
  });
}

initVideoDropZone();
