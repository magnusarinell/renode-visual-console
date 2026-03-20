import { useEffect, useRef } from "react";
import "./Daisy.css";

/**
 * Renders a 128×64 SSD1306 OLED display, scaled 3× to 384×192 px.
 *
 * Props:
 *   frame  {string|null}  base64-encoded 1024-byte framebuffer from backend,
 *                          or null when no signal is available.
 *
 * Framebuffer layout: page-mode (same as SSD1306 GDDRAM).
 *   Byte index = page * 128 + col
 *   Bit 0 (LSB) = top pixel of the 8-row page; bit 7 = bottom pixel.
 */
export function OledDisplay({ frame, small = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!frame) {
      // No signal — draw a dark screen with a dim label
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#1a2a2a";
      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.fillText("NO SIGNAL", 64, 34);
      return;
    }

    // Decode base64 → Uint8Array (1024 bytes)
    let bytes;
    try {
      const binary = atob(frame);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return;
    }
    if (bytes.length < 1024) return;

    // Build ImageData: 128 × 64 RGBA pixels
    const imageData = ctx.createImageData(128, 64);
    const pixels = imageData.data;

    for (let page = 0; page < 8; page++) {
      for (let col = 0; col < 128; col++) {
        const byte = bytes[page * 128 + col];
        for (let bit = 0; bit < 8; bit++) {
          const row = page * 8 + bit;
          const pixelIndex = (row * 128 + col) * 4;
          const on = (byte >> bit) & 1;
          // White-on-black OLED palette
          pixels[pixelIndex]     = on ? 255 : 0;   // R
          pixels[pixelIndex + 1] = on ? 255 : 0;   // G
          pixels[pixelIndex + 2] = on ? 255 : 0;   // B
          pixels[pixelIndex + 3] = 255;             // A
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [frame]);

  return (
    <div className="daisy-oled-panel">
      <div className="daisy-oled-label">OLED · SSD1306 · 128×64</div>
      <canvas
        ref={canvasRef}
        width={128}
        height={64}
        className={`daisy-oled-canvas${small ? " daisy-oled-canvas--small" : ""}`}
        aria-label="SSD1306 OLED display"
      />
    </div>
  );
}
