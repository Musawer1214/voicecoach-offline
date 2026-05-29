import { describe, expect, it } from "vitest";
import { encodePcmChunksToWav } from "./wav";

describe("WAV encoder", () => {
  it("writes a mono 16-bit PCM WAV header", () => {
    const wav = encodePcmChunksToWav([new Float32Array([0, 1, -1])], 16_000);

    expect(wav).not.toBeNull();
    const view = new DataView(wav as ArrayBuffer);
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(6);
  });

  it("returns null when no samples were captured", () => {
    expect(encodePcmChunksToWav([], 16_000)).toBeNull();
  });
});

function readAscii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_item, index) => String.fromCharCode(view.getUint8(offset + index))).join("");
}
