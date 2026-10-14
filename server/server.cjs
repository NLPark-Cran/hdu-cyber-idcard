/**
 * 杭电创业联盟工作证 - 后端服务（零依赖，纯 Node.js 标准库）
 *
 * 端口默认 8377，可用环境变量 PORT 覆盖。
 * 数据保存在 server/data/：
 *   submissions.json  提交记录
 *   photos/<id>.jpg   证件照
 *
 * 接口：
 *   POST /api/submit                 成员提交 { name, dept, photo? }
 *   GET  /api/health                 健康检查
 *   POST /api/admin/login            管理员登录 { username, password } -> { token }
 *   GET  /api/admin/submissions      列表（需 Authorization: Bearer <token>）
 *   GET  /api/admin/photos/<file>    证件照（需 token）
 *   DELETE /api/admin/submissions/:id 删除记录（需 token）
 *   GET  /api/admin/roster.csv       名单 CSV（需 token）
 *   POST /api/admin/import           批量导入 { items:[{name,dept,photo?}] }（需 token）
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8377);
const ADMIN_USER = process.env.IDCARD_ADMIN_USER || "cran";
const ADMIN_PASS = process.env.IDCARD_ADMIN_PASS || "cran";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

const DATA_DIR = path.join(__dirname, "..", "data");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");
const DB_FILE = path.join(DATA_DIR, "submissions.json");

for (const dir of [DATA_DIR, PHOTOS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveDB(records) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/** 简单的内存 token 表 */
const tokens = new Map(); // token -> expiresAt
function issueToken() {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  // 顺手清理过期 token
  for (const [t, exp] of tokens) if (exp < Date.now()) tokens.delete(t);
  return token;
}
function checkToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+([a-f0-9]{48})$/);
  if (!m) return false;
  const exp = tokens.get(m[1]);
  if (!exp) return false;
  if (exp < Date.now()) {
    tokens.delete(m[1]);
    return false;
  }
  return true;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * 保存一条提交记录：同名同部门视为同一人，有新照片则覆盖旧照片。
 * @returns {{id:string, updated:boolean, skipped:boolean}}
 */
function saveRecord(name, dept, photoDataUrl) {
  const records = readDB();
  const existing = records.find((r) => r.name === name && r.dept === dept);
  if (existing) {
    if (!photoDataUrl) return { id: existing.id, updated: false, skipped: true };
    const m = photoDataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/s);
    if (!m) throw Object.assign(new Error("照片格式仅支持 JPG/PNG"), { code: 400 });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 8 * 1024 * 1024) {
      throw Object.assign(new Error("照片不能超过 8MB"), { code: 400 });
    }
    if (existing.photoFile) {
      try {
        fs.unlinkSync(path.join(PHOTOS_DIR, existing.photoFile));
      } catch {}
    }
    existing.photoFile = `${existing.id}.${m[1] === "png" ? "png" : "jpg"}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, existing.photoFile), buf);
    existing.updatedAt = new Date().toISOString();
    saveDB(records);
    return { id: existing.id, updated: true, skipped: false };
  }

  const id = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  let photoFile = null;
  if (photoDataUrl) {
    const m = photoDataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/s);
    if (!m) throw Object.assign(new Error("照片格式仅支持 JPG/PNG"), { code: 400 });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 8 * 1024 * 1024) {
      throw Object.assign(new Error("照片不能超过 8MB"), { code: 400 });
    }
    photoFile = `${id}.${m[1] === "png" ? "png" : "jpg"}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, photoFile), buf);
  }
  records.push({ id, name, dept, photoFile, createdAt: new Date().toISOString() });
  saveDB(records);
  return { id, updated: false, skipped: false };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method || "";

  try {
    // ---------- 公开接口 ----------
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, time: Date.now() });
    }

    if (method === "POST" && pathname === "/api/submit") {
      const raw = await readBody(req);
      let data;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "JSON 解析失败" });
      }
      const name = String(data.name || "").trim().slice(0, 20);
      const dept = String(data.dept || "").trim().slice(0, 20);
      if (!name) return sendJson(res, 400, { error: "姓名不能为空" });
      try {
        const result = saveRecord(name, dept, data.photo || null);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, err.code || 500, { error: err.message });
      }
    }

    if (method === "POST" && pathname === "/api/admin/login") {
      const raw = await readBody(req, 64 * 1024);
      let data;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        data = {};
      }
      if (
        safeEqual(data.username || "", ADMIN_USER) &&
        safeEqual(data.password || "", ADMIN_PASS)
      ) {
        return sendJson(res, 200, { ok: true, token: issueToken() });
      }
      return sendJson(res, 401, { error: "用户名或密码错误" });
    }

    // ---------- 以下接口需要管理员 token ----------
    if (pathname.startsWith("/api/admin/") && !checkToken(req)) {
      return sendJson(res, 401, { error: "未登录或登录已过期" });
    }

    // 批量导入（zip 由前端解析成 items 后传入）
    if (method === "POST" && pathname === "/api/admin/import") {
      const raw = await readBody(req);
      let data;
      try {
        data = JSON.parse(raw.toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "JSON 解析失败" });
      }
      const items = Array.isArray(data.items) ? data.items.slice(0, 500) : [];
      if (!items.length) return sendJson(res, 400, { error: "导入内容为空" });

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const name = String(it.name || "").trim().slice(0, 20);
        const dept = String(it.dept || "").trim().slice(0, 20);
        if (!name) {
          errors.push(`第 ${i + 1} 行：姓名为空，已跳过`);
          continue;
        }
        try {
          const r = saveRecord(name, dept, it.photo || null);
          if (r.updated) updated++;
          else if (r.skipped) skipped++;
          else imported++;
        } catch (err) {
          errors.push(`第 ${i + 1} 行（${name}）：${err.message}`);
        }
      }
      return sendJson(res, 200, { ok: true, imported, updated, skipped, errors });
    }

    if (method === "GET" && pathname === "/api/admin/submissions") {
      const records = readDB().map((r) => ({
        id: r.id,
        name: r.name,
        dept: r.dept,
        hasPhoto: !!r.photoFile,
        photoFile: r.photoFile || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt || null,
      }));
      records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return sendJson(res, 200, { records });
    }

    const photoMatch = pathname.match(/^\/api\/admin\/photos\/([A-Za-z0-9._-]+)$/);
    if (method === "GET" && photoMatch) {
      const file = photoMatch[1];
      const full = path.join(PHOTOS_DIR, file);
      if (!full.startsWith(PHOTOS_DIR) || !fs.existsSync(full)) {
        return sendJson(res, 404, { error: "照片不存在" });
      }
      const ext = path.extname(file).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "private, max-age=60" });
      return fs.createReadStream(full).pipe(res);
    }

    const delMatch = pathname.match(/^\/api\/admin\/submissions\/([A-Za-z0-9]+)$/);
    if (method === "DELETE" && delMatch) {
      const id = delMatch[1];
      const records = readDB();
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1) return sendJson(res, 404, { error: "记录不存在" });
      const [removed] = records.splice(idx, 1);
      if (removed.photoFile) {
        try {
          fs.unlinkSync(path.join(PHOTOS_DIR, removed.photoFile));
        } catch {}
      }
      saveDB(records);
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/admin/roster.csv") {
      const records = readDB();
      const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const lines = ["\uFEFF姓名,部门,提交时间"];
      for (const r of records) {
        lines.push([esc(r.name), esc(r.dept), esc(r.createdAt)].join(","));
      }
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="roster.csv"',
      });
      return res.end(lines.join("\n"));
    }

    return sendJson(res, 404, { error: "接口不存在" });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "服务器内部错误" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`idcard server listening on http://127.0.0.1:${PORT}`);
});
