import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  FileArchive,
  FileDown,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { IDCardFront, IDCardBack } from "@/components/IDCard";
import {
  adminList,
  adminLogin,
  deleteSubmission,
  bulkImport,
  fetchRosterCsv,
  getToken,
  setToken,
  type Submission,
} from "@/lib/api";
import {
  downloadBlob,
  downloadZip,
  formatExt,
  nodeToBlob,
  nodeToCanvas,
  canvasToJpegBytes,
  type ImageFormat,
} from "@/lib/exportImage";
import {
  buildPdf,
  PDF_EXPORT_SCALE,
  type PdfPageInput,
} from "@/lib/exportPdf";
import { parseImportZip } from "@/lib/importZip";

const DEPTS = [
  "主席团",
  "综合创管中心",
  "项目管理中心",
  "文化创意中心",
  "创新资源中心",
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** blob URL → dataURL（html-to-image 导出用） */
function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
      URL.revokeObjectURL(blobUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("照片解码失败"));
    };
    img.src = blobUrl;
  });
}

export default function Admin() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [records, setRecords] = useState<Submission[]>([]);
  const [photoCache, setPhotoCache] = useState<Map<string, string>>(new Map());
  const [exportProps, setExportProps] = useState<{
    photo: string | null;
    name: string;
    dept: string;
  }>({ photo: null, name: "", dept: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [frontOnce, setFrontOnce] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      setRecords(await adminList());
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "列表加载失败");
      if ((e as { status?: number }).status === 401) setAuthed(false);
    }
  }, []);

  const filtered = useCallback(
    () =>
      filterDept === "all"
        ? records
        : records.filter((r) => r.dept === filterDept),
    [records, filterDept]
  );

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const list = filtered();
    setSelected((s) =>
      s.size === list.length && list.length > 0 ? new Set() : new Set(list.map((r) => r.id))
    );
  };

  const batchDelete = async () => {
    const list = records.filter((r) => selected.has(r.id));
    if (!list.length) return;
    if (!window.confirm(`确定删除选中的 ${list.length} 条记录吗？此操作不可恢复。`)) return;
    setBusy("batch-delete");
    let ok = 0;
    try {
      for (const rec of list) {
        try {
          await deleteSubmission(rec.id);
          ok++;
        } catch {
          toast.error(`删除 ${rec.name} 失败`);
        }
      }
      toast.success(`已删除 ${ok} 条记录`);
      await loadList();
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (authed) loadList();
  }, [authed, loadList]);

  const handleLogin = async () => {
    setLoginErr("");
    try {
      await adminLogin(username, password);
      setAuthed(true);
      toast.success("登录成功");
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : "登录失败");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setAuthed(false);
    setRecords([]);
    setPhotoCache(new Map());
  };

  /** 获取照片 dataURL（带缓存） */
  const photoDataUrl = useCallback(
    async (rec: Submission): Promise<string | null> => {
      if (!rec.photoFile) return null;
      const hit = photoCache.get(rec.photoFile);
      if (hit) return hit;
      const res = await fetch(
        `/api/admin/photos/${encodeURIComponent(rec.photoFile)}`,
        { headers: { Authorization: `Bearer ${getToken() || ""}` } }
      );
      if (!res.ok) throw new Error(`${rec.name} 的照片加载失败`);
      const url = URL.createObjectURL(await res.blob());
      const dataUrl = await blobUrlToDataUrl(url);
      setPhotoCache((m) => new Map(m).set(rec.photoFile!, dataUrl));
      return dataUrl;
    },
    [photoCache]
  );

  /** 把隐藏卡片渲染成 {正面, 背面} Blob */
  const renderPair = useCallback(
    async (format: ImageFormat): Promise<{ front: Blob; back: Blob }> => {
      await delay(120); // 等 React 渲染 + 图片加载
      await document.fonts.ready;
      const front = await nodeToBlob(frontRef.current!, format);
      const back = await nodeToBlob(backRef.current!, format);
      return { front, back };
    },
    []
  );

  /** 把隐藏卡片渲染成 {正面, 背面} Canvas（PDF 用，较低倍率控制文件体积） */
  const renderPairCanvases = useCallback(
    async (): Promise<{ front: HTMLCanvasElement; back: HTMLCanvasElement }> => {
      await delay(120);
      await document.fonts.ready;
      const front = await nodeToCanvas(frontRef.current!, PDF_EXPORT_SCALE);
      const back = await nodeToCanvas(backRef.current!, PDF_EXPORT_SCALE);
      return { front, back };
    },
    []
  );

  const exportOne = async (rec: Submission, format: ImageFormat) => {
    setBusy(`${rec.id}-${format}`);
    try {
      const photo = await photoDataUrl(rec);
      setExportProps({ photo, name: rec.name, dept: rec.dept });
      const ext = formatExt(format);
      const { front, back } = await renderPair(format);
      const prefix = `${rec.dept ? rec.dept + "-" : ""}${rec.name}`;
      downloadBlob(front, `工作证-${prefix}-正面.${ext}`);
      await delay(300);
      downloadBlob(back, `工作证-${prefix}-背面.${ext}`);
      toast.success(`已导出 ${rec.name}（${format.toUpperCase()}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async (format: ImageFormat) => {
    setBusy(`all-${format}`);
    const ext = formatExt(format);
    const entries: { name: string; blob: Blob }[] = [];
    const list = filtered();
    let frontSaved = false;
    try {
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        setProgress(`正在导出 ${i + 1}/${list.length}：${rec.name}`);
        const photo = await photoDataUrl(rec);
        setExportProps({ photo, name: rec.name, dept: rec.dept });
        const { front, back } = await renderPair(format);
        const prefix = `${rec.dept ? rec.dept + "-" : ""}${rec.name}`;
        // 正面无头像、人人相同：勾选后只保留一份通用正面
        if (!frontOnce || !frontSaved) {
          entries.push({
            name: frontOnce ? `00-正面通用.${ext}` : `${prefix}-正面.${ext}`,
            blob: front,
          });
          frontSaved = true;
        }
        entries.push({ name: `${prefix}-背面.${ext}`, blob: back });
      }
      await downloadZip(entries, `工作证${filterDept === "all" ? "全部" : filterDept}-${format.toUpperCase()}.zip`);
      toast.success(`已导出 ${list.length} 人（${format.toUpperCase()}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量导出失败");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  /** 单人 PDF：正面一页 + 背面一页（页面尺寸与参考 PDF 一致） */
  const exportOnePdf = async (rec: Submission) => {
    setBusy(`${rec.id}-pdf`);
    try {
      const photo = await photoDataUrl(rec);
      setExportProps({ photo, name: rec.name, dept: rec.dept });
      const { front, back } = await renderPairCanvases();
      const pages: PdfPageInput[] = [
        await canvasToJpegBytes(front),
        await canvasToJpegBytes(back),
      ];
      const prefix = `${rec.dept ? rec.dept + "-" : ""}${rec.name}`;
      downloadBlob(buildPdf(pages), `工作证-${prefix}.pdf`);
      toast.success(`已导出 ${rec.name}（PDF）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 导出失败");
    } finally {
      setBusy(null);
    }
  };

  /** 批量 PDF 打印版：每人正面、背面各一页，合成一个 PDF */
  const exportAllPdf = async () => {
    setBusy("all-pdf");
    const list = filtered();
    const pages: PdfPageInput[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        setProgress(`正在生成 PDF ${i + 1}/${list.length}：${rec.name}`);
        const photo = await photoDataUrl(rec);
        setExportProps({ photo, name: rec.name, dept: rec.dept });
        const { front, back } = await renderPairCanvases();
        pages.push(await canvasToJpegBytes(front));
        pages.push(await canvasToJpegBytes(back));
      }
      downloadBlob(
        buildPdf(pages),
        `工作证${filterDept === "all" ? "全部" : filterDept}-打印版.pdf`
      );
      toast.success(`已导出 PDF 打印版（${list.length} 人，${pages.length} 页）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 批量导出失败");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const importZipFile = async (file: File) => {
    setBusy("import");
    try {
      const { items, warnings } = await parseImportZip(file);
      const result = await bulkImport(items);
      const parts = [`新增 ${result.imported}`, `覆盖 ${result.updated}`];
      if (result.skipped) parts.push(`无照片跳过 ${result.skipped}`);
      toast.success(`导入完成：${parts.join("，")}`);
      for (const w of warnings.slice(0, 5)) toast.warning(w);
      if (warnings.length > 5) toast.warning(`另有 ${warnings.length - 5} 条警告`);
      if (result.errors.length) {
        for (const err of result.errors.slice(0, 5)) toast.error(err);
      }
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(null);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const downloadRoster = async () => {
    try {
      const blob = await fetchRosterCsv();
      downloadBlob(blob, "工作证名单.csv");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "名单导出失败");
    }
  };

  const handleDelete = async (rec: Submission) => {
    if (!window.confirm(`确定删除「${rec.name}（${rec.dept}）」的记录吗？`)) return;
    try {
      await deleteSubmission(rec.id);
      toast.success(`已删除 ${rec.name}`);
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // ---------- 登录页 ----------
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-lg">管理员登录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-user">用户名</Label>
              <Input
                id="admin-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-pass">密码</Label>
              <Input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="current-password"
              />
            </div>
            {loginErr && <p className="text-sm text-red-600">{loginErr}</p>}
            <Button className="w-full" onClick={handleLogin}>
              登录
            </Button>
            <p className="text-center text-sm">
              <Link to="/" className="text-muted-foreground hover:underline">
                返回工作证制作
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- 管理后台 ----------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" title="返回">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold">工作证管理后台</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            退出登录
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            disabled={busy !== null}
          >
            <FileArchive className="mr-1.5 h-4 w-4" />
            {busy === "import" ? "导入中…" : "导入 ZIP 批量照片"}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importZipFile(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={downloadRoster}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            导出名单 CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadList}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">筛选</span>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部部门</SelectItem>
                {DEPTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={batchDelete}
              disabled={busy !== null}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              批量删除（{selected.size}）
            </Button>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {filterDept === "all"
              ? `共 ${records.length} 条记录`
              : `${filterDept}：${filtered().length} / 共 ${records.length} 条`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">全部导出：</span>
          {(["png", "jpg", "tiff"] as ImageFormat[]).map((f) => (
            <Button
              key={f}
              size="sm"
              onClick={() => exportAll(f)}
              disabled={busy !== null || records.length === 0}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              {busy === `all-${f}` ? "导出中…" : `${f.toUpperCase()} ZIP`}
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={exportAllPdf}
            disabled={busy !== null || records.length === 0}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {busy === "all-pdf" ? "生成中…" : "PDF 打印版"}
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-700"
              checked={frontOnce}
              onChange={(e) => setFrontOnce(e.target.checked)}
            />
            正面只导一份（无头像，人人相同）
          </label>
        </div>
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        filtered().length > 0 && selected.size === filtered().length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead className="w-16">照片</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered().length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      暂无记录，等待成员提交或 ZIP 导入
                    </TableCell>
                  </TableRow>
                )}
                {filtered().map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(rec.id)}
                        onCheckedChange={() => toggleSelect(rec.id)}
                        aria-label={`选择 ${rec.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <PhotoThumb photoFile={rec.photoFile} name={rec.name} />
                    </TableCell>
                    <TableCell className="font-medium">{rec.name}</TableCell>
                    <TableCell>{rec.dept || "—"}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(rec.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        {(["png", "jpg", "tiff"] as ImageFormat[]).map((f) => (
                          <Button
                            key={f}
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => exportOne(rec, f)}
                          >
                            {busy === `${rec.id}-${f}` ? "…" : f.toUpperCase()}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => exportOnePdf(rec)}
                        >
                          {busy === `${rec.id}-pdf` ? "…" : "PDF"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(rec)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-slate-100 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ZIP 批量导入规范</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>zip 根目录必须包含 <code className="bg-white px-1 rounded">list.csv</code>（UTF-8，首行表头），照片为 JPG/PNG：</p>
            <pre className="bg-white rounded p-2 overflow-x-auto">{`list.csv：
姓名,部门,照片
张三,宣传部,张三.jpg
李四,技术部,技术部-李四.png
王五,外联部,          （照片列留空则不导入照片）

照片文件名需与 list.csv 照片列一致；不写表头时按 姓名,部门,照片 顺序解析；
省略照片列时自动匹配「姓名.jpg / 姓名.png」。同名同部门会覆盖旧照片。`}</pre>
          </CardContent>
        </Card>
      </main>

      {/* 离屏渲染用的卡片（导出 PNG/JPG/TIFF 的源） */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          pointerEvents: "none",
          display: "flex",
          gap: 8,
        }}
      >
        <IDCardFront ref={frontRef} />
        <IDCardBack
          ref={backRef}
          photo={exportProps.photo}
          name={exportProps.name}
          dept={exportProps.dept}
        />
      </div>
    </div>
  );
}

function PhotoThumb({
  photoFile,
  name,
}: {
  photoFile: string | null;
  name: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!photoFile) return;
    let alive = true;
    (async () => {
      const res = await fetch(
        `/api/admin/photos/${encodeURIComponent(photoFile)}`,
        { headers: { Authorization: `Bearer ${getToken() || ""}` } }
      );
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      if (alive) setSrc(url);
      else URL.revokeObjectURL(url);
    })();
    return () => {
      alive = false;
    };
  }, [photoFile]);

  if (!photoFile) {
    return (
      <div className="h-14 w-10 bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400">
        无照片
      </div>
    );
  }
  if (!src) {
    return <div className="h-14 w-10 bg-slate-100 rounded animate-pulse" />;
  }
  return (
    <img
      src={src}
      alt={name}
      className="h-14 w-10 object-cover rounded"
      onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
    />
  );
}
