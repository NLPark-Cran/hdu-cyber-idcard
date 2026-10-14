import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router";
import { toPng } from "html-to-image";
import {
  CloudUpload,
  Download,
  ImagePlus,
  RotateCcw,
  Settings,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { IDCardFront, IDCardBack } from "@/components/IDCard";
import { CropDialog, readFileAsDataURL } from "@/components/CropDialog";
import { submitRecord } from "@/lib/api";
import { CARD_W } from "@/lib/idcard";
import Admin from "@/pages/Admin";

const DEPT_SUGGESTIONS = [
  "主席团",
  "综合创管中心",
  "项目管理中心",
  "文化创意中心",
  "创新资源中心",
];

function Home() {
  const [name, setName] = useState(() => localStorage.getItem("idcard.name") ?? "");
  const [dept, setDept] = useState(() => localStorage.getItem("idcard.dept") ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"front" | "back" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("idcard.name", name);
  }, [name]);
  useEffect(() => {
    localStorage.setItem("idcard.dept", dept);
  }, [dept]);

  const pickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      setCropSrc(dataUrl);
    } catch {
      toast.error("图片读取失败，请换一张试试");
    }
  }, []);

  const exportCard = useCallback(
    async (side: "front" | "back") => {
      const node = side === "front" ? frontRef.current : backRef.current;
      if (!node) return;
      setExporting(side);
      try {
        await document.fonts.ready;
        const dataUrl = await toPng(node, {
          pixelRatio: 4, // 导出 1224 x 1940，供打印工作证
        });
        const a = document.createElement("a");
        a.download = `工作证-${side === "front" ? "正面" : "背面"}-${name || "未命名"}.png`;
        a.href = dataUrl;
        a.click();
        toast.success("已下载 PNG");
      } catch {
        toast.error("导出失败，请重试");
      } finally {
        setExporting(null);
      }
    },
    [name]
  );

  const handleSubmit = async () => {
    const n = name.trim();
    if (!n) {
      toast.error("请先填写姓名再提交");
      return;
    }
    setSubmitting(true);
    try {
      const r = await submitRecord({ name: n, dept: dept.trim(), photo });
      toast.success(r.updated ? "已更新服务器上的记录" : "已提交到服务器，谢谢！");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败，请检查网络后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide">
              杭电创业联盟 · 工作证制作
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              上传证件照并填写信息，实时预览工作证效果，一键下载高清 PNG。
            </p>
          </div>
          <Link to="/admin">
            <Button variant="outline" size="sm">
              <Settings className="mr-1.5 h-4 w-4" />
              管理员入口
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* 左侧：信息表单 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">成员信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  placeholder="请输入姓名"
                  value={name}
                  maxLength={8}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept">部门</Label>
                <Input
                  id="dept"
                  placeholder="请输入或选择部门"
                  value={dept}
                  maxLength={10}
                  onChange={(e) => setDept(e.target.value)}
                  list="dept-suggestions"
                />
                <datalist id="dept-suggestions">
                  {DEPT_SUGGESTIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label>证件照</Label>
                <div
                  role="button"
                  tabIndex={0}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors cursor-pointer ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-slate-300 hover:border-primary/60 hover:bg-slate-50"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    pickFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt="证件照预览"
                      className="h-28 w-20 object-cover rounded-sm shadow"
                    />
                  ) : (
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                  )}
                  <span className="text-muted-foreground">
                    {photo ? "点击或拖拽更换照片" : "点击或拖拽上传证件照"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    支持 JPG / PNG，上传后可缩放拖动裁剪
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {photo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setPhoto(null)}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    恢复默认占位照片
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">提交与导出</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                <CloudUpload className="mr-1.5 h-4 w-4" />
                {submitting ? "提交中…" : "提交到创盟服务器"}
              </Button>
              <Button
                onClick={() => exportCard("front")}
                disabled={exporting !== null}
                variant="outline"
              >
                <Download className="mr-1.5 h-4 w-4" />
                {exporting === "front" ? "导出中…" : "下载正面 PNG"}
              </Button>
              <Button
                onClick={() => exportCard("back")}
                disabled={exporting !== null}
                variant="outline"
              >
                <Download className="mr-1.5 h-4 w-4" />
                {exporting === "back" ? "导出中…" : "下载背面 PNG"}
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                提交后管理员可在后台统一导出所有人的工作证；自行下载的 PNG 为
                1224 × 1940 px（4 倍清晰度），可直接用于打印。
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：实时预览 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImagePlus className="h-4 w-4" />
              实时预览
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div
                className="flex gap-8 justify-start md:justify-center py-2 pr-4"
                style={{ minWidth: CARD_W * 2 + 64 }}
              >
                <div className="flex flex-col items-center gap-2">
                  <IDCardFront ref={frontRef} />
                  <span className="text-xs text-muted-foreground">正面</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <IDCardBack
                    ref={backRef}
                    photo={photo}
                    name={name.trim()}
                    dept={dept.trim()}
                  />
                  <span className="text-xs text-muted-foreground">背面</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <CropDialog
        imageSrc={cropSrc}
        onCancel={() => setCropSrc(null)}
        onConfirm={(dataUrl) => {
          setPhoto(dataUrl);
          setCropSrc(null);
          toast.success("照片已更新");
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </>
  );
}
