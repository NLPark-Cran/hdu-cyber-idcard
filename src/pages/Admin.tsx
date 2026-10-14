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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  type ImageFormat,
} from "@/lib/exportImage";
import { parseImportZip } from "@/lib/importZip";

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
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      setRecords(await adminList());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "列表加载失败");
      if ((e as { status?: number }).status === 401) setAuthed(false);
    }
  }, []);

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
    try {
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        setProgress(`正在导出 ${i + 1}/${records.length}：${rec.name}`);
        const photo = await photoDataUrl(rec);
        setExportProps({ photo, name: rec.name, dept: rec.dept });
        const { front, back } = await renderPair(format);
        const prefix = `${rec.dept ? rec.dept + "-" : ""}${rec.name}`;
        entries.push({ name: `${prefix}-正面.${ext}`, blob: front });
        entries.push({ name: `${prefix}-背面.${ext}`, blob: back });
      }
      await downloadZip(entries, `工作证全部-${format.toUpperCase()}.zip`);
      toast.success(`已导出全部 ${records.length} 人（${format.toUpperCase()}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量导出失败");
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
          <span className="text-sm text-muted-foreground ml-auto">
            共 {records.length} 条记录
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
        </div>
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">照片</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      暂无记录，等待成员提交或 ZIP 导入
                    </TableCell>
                  </TableRow>
                )}
                {records.map((rec) => (
                  <TableRow key={rec.id}>
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
