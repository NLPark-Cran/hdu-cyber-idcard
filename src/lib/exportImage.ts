import { toPng } from "html-to-image";
import JSZip from "jszip";
import * as UTIF from "utif";

export type ImageFormat = "png" | "jpg" | "tiff";

const FORMAT_EXT: Record<ImageFormat, string> = {
  png: "png",
  jpg: "jpg",
  tiff: "tif",
};

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, payload] = dataUrl.split(",");
  const mime = head.match(/data:(.*?)(;base64)?$/)?.[1] || "image/png";
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** html 节点 → 4 倍清晰度 PNG dataURL */
export async function nodeToPngDataUrl(node: HTMLElement): Promise<string> {
  return toPng(node, { pixelRatio: 4 });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

/** PNG dataURL → 铺白底画布 */
async function drawOnCanvas(pngDataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(pngDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** html 节点 → 指定格式 Blob */
export async function nodeToBlob(
  node: HTMLElement,
  format: ImageFormat
): Promise<Blob> {
  const pngDataUrl = await nodeToPngDataUrl(node);
  if (format === "png") return dataUrlToBlob(pngDataUrl);

  const canvas = await drawOnCanvas(pngDataUrl);
  if (format === "jpg") {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("JPEG 编码失败"))),
        "image/jpeg",
        0.92
      );
    });
  }

  // TIFF：UTIF 编码 RGBA
  const ctx = canvas.getContext("2d")!;
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buffer = UTIF.encodeImage(rgba, canvas.width, canvas.height);
  return new Blob([buffer], { type: "image/tiff" });
}

export function formatExt(format: ImageFormat): string {
  return FORMAT_EXT[format];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 打包 zip 并触发下载 */
export async function downloadZip(
  entries: { name: string; blob: Blob }[],
  zipName: string
) {
  const zip = new JSZip();
  for (const e of entries) {
    zip.file(sanitizeZipName(e.name), e.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

function sanitizeZipName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}
