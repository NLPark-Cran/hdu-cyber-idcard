import JSZip from "jszip";

export type ImportItem = { name: string; dept: string; photo: string | null };

const IMAGE_EXT = /\.(jpe?g|png)$/i;

function guessMime(filename: string): string {
  return /\.png$/i.test(filename) ? "image/png" : "image/jpeg";
}

/** 解析 CSV 文本，支持 BOM、引号包裹字段、\r\n */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const NAME_KEYS = ["姓名", "名字", "name"];
const DEPT_KEYS = ["部门", "department", "dept"];
const PHOTO_KEYS = ["照片", "相片", "图片", "文件名", "photo", "image", "file"];

function colIndex(header: string[], keys: string[]): number {
  return header.findIndex((h) =>
    keys.some((k) => h.trim().toLowerCase().includes(k.toLowerCase()))
  );
}

/**
 * 解析规范 zip：
 *   list.csv（必需，可位于根目录或任意子目录）：表头 姓名,部门,照片
 *   照片文件：JPG/PNG，文件名与 list.csv 的照片列一致（允许带相对路径）
 * 兼容：无表头时按 姓名,部门,照片 顺序解析；照片列缺省时按「姓名.jpg/png」自动匹配。
 */
export async function parseImportZip(file: File): Promise<{
  items: ImportItem[];
  warnings: string[];
}> {
  const zip = await JSZip.loadAsync(file);

  const entries: { path: string; lower: string }[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) entries.push({ path: relativePath, lower: relativePath.toLowerCase() });
  });

  const csvEntry = entries.find((e) => e.lower === "list.csv") ||
    entries.find((e) => e.lower.endsWith("/list.csv")) ||
    entries.find((e) => e.lower.endsWith(".csv"));
  if (!csvEntry) {
    throw new Error("zip 中找不到 list.csv（需要 姓名,部门,照片 三列清单）");
  }

  const csvText = await zip.file(csvEntry.path)!.async("string");
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("list.csv 内容为空");

  // 表头识别
  let nameIdx = 0;
  let deptIdx = 1;
  let photoIdx = 2;
  let hasHeader = false;
  const first = rows[0].map((c) => c.trim());
  const ni = colIndex(first, NAME_KEYS);
  if (ni >= 0) {
    hasHeader = true;
    nameIdx = ni;
    deptIdx = colIndex(first, DEPT_KEYS);
    photoIdx = colIndex(first, PHOTO_KEYS);
    if (deptIdx < 0) deptIdx = ni + 1;
    if (photoIdx < 0) photoIdx = -1;
  } else if (first.length < 3) {
    photoIdx = -1; // 只有 姓名,部门 两列时自动匹配照片
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length) throw new Error("list.csv 中没有数据行");

  // 照片查找：先全路径，再 basename
  const byLower = new Map(entries.map((e) => [e.lower, e.path]));
  const byBase = new Map<string, string>();
  for (const e of entries) {
    const base = e.lower.split("/").pop()!;
    if (!byBase.has(base)) byBase.set(base, e.path);
  }
  const findPhoto = (ref: string): string | null => {
    const norm = ref.trim().replace(/^\.\/+/, "").toLowerCase();
    if (!norm) return null;
    return byLower.get(norm) ?? byBase.get(norm.split("/").pop()!) ?? null;
  };

  const items: ImportItem[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const name = (cells[nameIdx] || "").trim();
    if (!name) {
      warnings.push(`list.csv 第 ${i + (hasHeader ? 2 : 1)} 行姓名为空，已跳过`);
      continue;
    }
    const dept = (cells[deptIdx] || "").trim();

    let photoRef = photoIdx >= 0 ? (cells[photoIdx] || "").trim() : "";
    if (!photoRef) {
      // 自动匹配：<姓名>.jpg / <姓名>.png
      for (const ext of [".jpg", ".jpeg", ".png"]) {
        const hit = findPhoto(`${name}${ext}`);
        if (hit) {
          photoRef = hit;
          break;
        }
      }
    }

    let photo: string | null = null;
    if (photoRef) {
      const entryPath = findPhoto(photoRef);
      if (!entryPath) {
        warnings.push(`${name}：找不到照片文件「${photoRef}」`);
      } else if (!IMAGE_EXT.test(entryPath)) {
        warnings.push(`${name}：照片「${entryPath}」不是 JPG/PNG，已跳过照片`);
      } else {
        const b64 = await zip.file(entryPath)!.async("base64");
        photo = `data:${guessMime(entryPath)};base64,${b64}`;
      }
    }
    items.push({ name, dept, photo });
  }

  if (!items.length) throw new Error("list.csv 中没有可用记录");
  return { items, warnings };
}
