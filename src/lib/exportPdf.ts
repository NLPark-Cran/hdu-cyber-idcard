/**
 * 零依赖 PDF 组装器：把若干张 JPEG 各铺成一页，生成打印版 PDF。
 * 页面尺寸与参考文件 工作证_20261013_121340_0000.pdf 一致（153 x 242.25 pt，
 * 即 54 x 85.4 mm，每页一张卡：正面/背面各占一页）。
 */

export interface PdfPageInput {
  /** JPEG 字节流（canvas.toBlob("image/jpeg") 产物，JFIF/YCbCr） */
  data: Uint8Array;
  width: number;
  height: number;
}

export const PDF_PAGE_W = 153;
export const PDF_PAGE_H = 242.25;

/** 卡面导出的栅格倍率：卡片 306x485 css px，3 倍 = 918x1455 px ≈ 430 DPI（153pt 页宽） */
export const PDF_EXPORT_SCALE = 3;

export function buildPdf(pages: PdfPageInput[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;

  const push = (s: string | Uint8Array) => {
    const b = typeof s === "string" ? enc.encode(s) : s;
    chunks.push(b);
    len += b.length;
  };
  const beginObj = (id: number) => {
    offsets[id] = len;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // 对象编号：1 Catalog，2 Pages，之后每页 3 个对象（Page / Content / Image）
  const pageIds = pages.map((_, i) => 3 + i * 3);
  const contentIds = pages.map((_, i) => 4 + i * 3);
  const imageIds = pages.map((_, i) => 5 + i * 3);
  const objCount = 2 + pages.length * 3;

  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObj(2);
  push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`
  );

  pages.forEach((p, i) => {
    beginObj(pageIds[i]);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_W} ${PDF_PAGE_H}] ` +
        `/Resources << /XObject << /Im${i} ${imageIds[i]} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${contentIds[i]} 0 R >>\nendobj\n`
    );

    const stream = `q\n${PDF_PAGE_W} 0 0 ${PDF_PAGE_H} 0 0 cm\n/Im${i} Do\nQ\n`;
    beginObj(contentIds[i]);
    push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);

    beginObj(imageIds[i]);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`
    );
    push(p.data);
    push("\nendstream\nendobj\n");
  });

  const xrefPos = len;
  push(`xref\n0 ${objCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let id = 1; id <= objCount; id++) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
  );

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
