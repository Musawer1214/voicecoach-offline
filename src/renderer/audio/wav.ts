const DEFAULT_SAMPLE_RATE = 16_000;

export function encodePcmChunksToWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer | null {
  const totalSamples = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (totalSamples === 0) {
    return null;
  }

  const sourceSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : DEFAULT_SAMPLE_RATE;
  const samples = resampleToMono16k(flattenChunks(chunks, totalSamples), sourceSampleRate);
  const safeSampleRate = DEFAULT_SAMPLE_RATE;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

function flattenChunks(chunks: Float32Array[], totalSamples: number): Float32Array {
  const samples = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

function resampleToMono16k(samples: Float32Array, sourceSampleRate: number): Float32Array {
  if (sourceSampleRate === DEFAULT_SAMPLE_RATE) {
    return samples;
  }

  const ratio = sourceSampleRate / DEFAULT_SAMPLE_RATE;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const resampled = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const weight = sourceIndex - leftIndex;
    resampled[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return resampled;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
