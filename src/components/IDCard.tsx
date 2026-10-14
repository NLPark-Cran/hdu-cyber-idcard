import { forwardRef } from "react";
import { U, BLUE, FONT_KAI, FONT_SONG, FONT_UNION } from "@/lib/idcard";

import frontStripA from "@/assets/front-strip-a.png";
import frontStripB from "@/assets/front-strip-b.png";
import logo from "@/assets/logo.png";
import frontBlockLight from "@/assets/front-block-light.png";
import frontSqDark from "@/assets/front-sq-dark.png";
import frontSqLight from "@/assets/front-sq-light.png";
import backStrip from "@/assets/back-strip.png";
import backBar from "@/assets/back-bar.jpg";
import backBarLeft from "@/assets/back-bar-left.png";
import backWatermark from "@/assets/back-watermark.png";
import photoPlaceholder from "@/assets/photo-placeholder.jpg";

type BoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

/** 按 PPT 单位定位的绝对定位容器，U 倍映射为像素 */
function Box({ x, y, w, h, children, style }: BoxProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: x * U,
        top: y * U,
        width: w * U,
        height: h * U,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Img({
  src,
  x,
  y,
  w,
  h,
}: {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        left: x * U,
        top: y * U,
        width: w * U,
        height: h * U,
        objectFit: "fill",
      }}
    />
  );
}

const cardBase: React.CSSProperties = {
  position: "relative",
  width: 153 * U,
  height: 242.5 * U,
  background: "#fff",
  overflow: "hidden",
  flexShrink: 0,
};

/** 正面：创业 + UNION + logo */
export const IDCardFront = forwardRef<HTMLDivElement>(function IDCardFront(
  _,
  ref
) {
  return (
    <div ref={ref} style={cardBase}>
      {/* 左边缘深蓝色竖条 */}
      <Box x={6.2} y={0} w={3} h={162.2} style={{ background: BLUE }} />
      {/* 右上蓝色几何竖条（两层素材，顺序与 PPT 一致） */}
      <Img src={frontStripA} x={123.8} y={0} w={29.2} h={106.8} />
      <Img src={frontStripB} x={123.8} y={0} w={29.2} h={107.2} />
      {/* 顶部五个小方点 */}
      <Box x={95.1} y={10.3} w={27} h={3} style={{ background: BLUE }} />
      {/* 创业 */}
      <Box
        x={41}
        y={28.7}
        w={70}
        h={41.8}
        style={{
          color: BLUE,
          fontSize: 34 * U,
          lineHeight: 1,
          fontFamily: FONT_KAI,
          letterSpacing: -0.35 * U,
        }}
      >
        创业
      </Box>
      {/* logo */}
      <Img src={logo} x={29.2} y={73.9} w={94.5} h={94.5} />
      {/* 左侧内竖线（长） */}
      <Box x={16.1} y={79.7} w={3} h={117.6} style={{ background: BLUE }} />
      {/* UNION */}
      <Box
        x={40}
        y={173.6}
        w={73.1}
        h={22.6}
        style={{
          color: BLUE,
          fontSize: 18 * U,
          lineHeight: 1,
          fontFamily: FONT_UNION,
          letterSpacing: 1.6 * U,
        }}
      >
        UNION
      </Box>
      {/* 左下浅蓝色块 */}
      <Img src={frontBlockLight} x={0} y={186.7} w={102} h={29.2} />
      {/* 竖线穿过色块处留白断口 */}
      <Box x={16.1} y={186.7} w={3} h={12.1} style={{ background: "#fff" }} />
      {/* 右下双色小方块 */}
      <Img src={frontSqLight} x={127} y={222.3} w={26} h={20} />
      <Img src={frontSqDark} x={134.1} y={216.2} w={18.9} h={26.1} />
      {/* 底部标语 */}
      <Box
        x={31.2}
        y={221.4}
        w={90}
        h={11.3}
        style={{
          color: "#000",
          fontSize: 8 * U,
          lineHeight: 1,
          fontFamily: FONT_SONG,
        }}
      >
        一群人｜一件事｜一辈子
      </Box>
    </div>
  );
});

type BackProps = {
  photo: string | null;
  name: string;
  dept: string;
};

/** 背面：工作证竖排字 + 照片 + 姓名/部门 */
export const IDCardBack = forwardRef<HTMLDivElement, BackProps>(
  function IDCardBack({ photo, name, dept }, ref) {
    return (
      <div ref={ref} style={cardBase}>
        {/* 右侧蓝色几何竖条 */}
        <Img src={backStrip} x={120.5} y={0} w={32.5} h={242.2} />
        {/* 底部通栏横条 */}
        <Img src={backBar} x={0} y={215.4} w={153} h={26.8} />
        <Img src={backBarLeft} x={0} y={215.4} w={120.6} h={26.8} />
        {/* 左上两排蓝色小方点（PPT 中为点线） */}
        <Box
          x={0}
          y={12.9}
          w={62.7}
          h={3}
          style={{ borderTop: `${3 * U}px dotted ${BLUE}` }}
        />
        <Box
          x={0}
          y={19.8}
          w={44.5}
          h={3}
          style={{ borderTop: `${3 * U}px dotted ${BLUE}` }}
        />
        {/* 照片区（默认占位图，上传后替换） */}
        <Box x={23.2} y={53.2} w={50.7} h={71} style={{ background: "#fff" }}>
          <img
            src={photo ?? photoPlaceholder}
            alt="证件照"
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
        {/* 淡色 logo 水印 */}
        <Img src={backWatermark} x={3.6} y={132} w={94.5} h={94.5} />
        {/* 竖排 工作证 */}
        <Box
          x={95.9}
          y={32.7}
          w={39.8}
          h={46.1}
          style={{
            color: BLUE,
            fontSize: 37.5 * U,
            lineHeight: 1,
            fontFamily: FONT_KAI,
            letterSpacing: -0.5 * U,
          }}
        >
          工
        </Box>
        <Box
          x={95.9}
          y={78.2}
          w={39.8}
          h={53.6}
          style={{
            color: BLUE,
            fontSize: 37.5 * U,
            lineHeight: 1.428,
            fontFamily: FONT_KAI,
            letterSpacing: -0.5 * U,
          }}
        >
          作
        </Box>
        <Box
          x={95.9}
          y={131.8}
          w={39.8}
          h={53.6}
          style={{
            color: BLUE,
            fontSize: 37.5 * U,
            lineHeight: 1.428,
            fontFamily: FONT_KAI,
            letterSpacing: -0.5 * U,
          }}
        >
          证
        </Box>
        {/* 姓名 / 部门（照片正下方居中） */}
        <Box
          x={8.55}
          y={133}
          w={80}
          h={15}
          style={{
            textAlign: "center",
            color: "#000",
            fontSize: 12 * U,
            lineHeight: 1.25,
            fontFamily: FONT_KAI,
            whiteSpace: "nowrap",
          }}
        >
          {name || "姓名"}
        </Box>
        <Box
          x={8.55}
          y={148.5}
          w={80}
          h={13}
          style={{
            textAlign: "center",
            color: "#000",
            fontSize: 9.5 * U,
            lineHeight: 1.25,
            fontFamily: FONT_KAI,
            whiteSpace: "nowrap",
          }}
        >
          {dept || "部门"}
        </Box>
        {/* 底部标语 */}
        <Box
          x={31.2}
          y={221.4}
          w={90}
          h={11.3}
          style={{
            color: "#000",
            fontSize: 8 * U,
            lineHeight: 1,
            fontFamily: FONT_SONG,
          }}
        >
          一群人｜一件事｜一辈子
        </Box>
      </div>
    );
  }
);
