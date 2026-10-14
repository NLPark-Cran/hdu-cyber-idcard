import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// 与 PPT 背面照片区 50.7 x 71 一致
const ASPECT = 50.7 / 71;

type Props = {
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

/** 读取本地图片文件为 dataURL，避免浏览器对 file:// ObjectURL 的限制 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cropImage(src: string, area: Area): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(area.width);
      canvas.height = Math.round(area.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas 不可用"));
      ctx.drawImage(
        img,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        area.width,
        area.height
      );
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function CropDialog({ imageSrc, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback(
    (_: Area, pixels: Area) => setArea(pixels),
    []
  );

  const handleConfirm = async () => {
    if (!imageSrc || !area) return;
    setBusy(true);
    try {
      const dataUrl = await cropImage(imageSrc, area);
      onConfirm(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!imageSrc} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>裁剪证件照</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative w-full h-[380px] bg-neutral-900 rounded-md overflow-hidden">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="flex items-center gap-3 px-1">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              缩放
            </span>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={([v]) => setZoom(v)}
              className="flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            拖动调整位置，滑块缩放。裁剪比例与工作证照片区一致（约 5:7）。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!area || busy}>
            {busy ? "处理中…" : "确认裁剪"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
