import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { IDCardFront, IDCardBack } from "@/components/IDCard";
import { CropDialog, readFileAsDataURL } from "@/components/CropDialog";
import { submitRecord } from "@/lib/api";
import {
  downloadBlob,
  formatExt,
  nodeToBlob,
  type ImageFormat,
} from "@/lib/exportImage";
import { CARD_W } from "@/lib/idcard";
import Admin from "@/pages/Admin";

const DEPTS = [
  "主席团",
  "综合创管中心",
  "项目管理中心",
  "文化创意中心",
  "创新资源中心",
];

function Home() {
  const [name, setName] = useState(() => localStorage.getItem("idcard.name") ?? "");
  const [dept, setDept] = useState(() => {
    const saved = localStorage.getItem("idcard.dept") ?? "";
    // 旧版本可能存过自由文本，不在现有部门列表里则重置
    return DEPTS.includes(saved) ? saved : "";
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"front" | "back" | null>(null);
  const [format, setFormat] = useState<ImageFormat>("png");
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
        // pixelRatio 4：导出 1224 x 1940，供打印工作证
        const blob = await nodeToBlob(node, format);
        const sideLabel = side === "front" ? "正面" : "背面";
        downloadBlob(
          blob,
          `工作证-${sideLabel}-${name || "未命名"}.${formatExt(format)}`
        );
        toast.success(`已下载 ${format === "tiff" ? "TIF" : "PNG"}`);
      } catch {
        toast.error("导出失败，请重试");
      } finally {
        setExporting(null);
      }
    },
    [name, format]
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
            <h1 className="text-xl font-bold tracking-wide">创盟工作证</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              上传证件照并填写信息，实时预览工作证效果，可下载 PNG 或 TIF。
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
                <Label>部门</Label>
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger id="dept">
                    <SelectValue placeholder="请选择部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button onClick={handleSubmit} disabled={submitting || !dept}>
                <CloudUpload className="mr-1.5 h-4 w-4" />
                {submitting ? "提交中…" : "提交到创盟服务器"}
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  格式
                </span>
                <Select
                  value={format}
                  onValueChange={(v) => setFormat(v as ImageFormat)}
                >
                  <SelectTrigger id="format" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG（屏幕/网络用）</SelectItem>
                    <SelectItem value="tiff">TIF（打印店通用）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => exportCard("front")}
                  disabled={exporting !== null}
                  variant="outline"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {exporting === "front" ? "导出中…" : "下载正面"}
                </Button>
                <Button
                  onClick={() => exportCard("back")}
                  disabled={exporting !== null}
                  variant="outline"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {exporting === "back" ? "导出中…" : "下载背面"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                提交后管理员可在后台统一导出所有人的工作证。自行下载的图片为
                1224 × 1940 px（4 倍清晰度）；交打印店制证建议选 TIF，无损且各打印店都收。
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
