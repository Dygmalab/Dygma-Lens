import React from "react";
import type { KeyboardModel } from "../shared/types";
import { SONSEI_KEYS } from "./geometry-sonsei";
import { decodeKey, superkeyIndex, layoutOverrides } from "./keycodes";

interface Props {
  model: KeyboardModel;
  activeLayer: number;
  layout: string;
  layerNames?: string[];
}

const SVG_W = 1270;
const SVG_H = 560;   // full coordinate space (key positions reference this)
const VIEW_Y = 50;   // 27 px above topmost key corners (~y=77 after 10° rotation)
const VIEW_H = 462;  // bottom = 512, giving 10px below the innermost thumb key paths
                     // (thumb arcs extend to ~y=503 after rotation — wider than the rect bounds)
const FS = 13;
const FSS = 11; // two-line keys (Super/name, Macro/name) — same size both lines
const FSH = 9;
const MOD_BOX_H = 9;
const MOD_BOX_GAP = 2;
const MOD_BOX_FS = 6;
const MOD_BOX_PX = 3;
// Approximate char width at MOD_BOX_FS for system-ui proportional font
const MOD_CHAR_W = 3.5;
const MOD_WIDTH: Record<string, number> = {
  Ctrl: 4, Shift: 5, Alt: 3, AltGr: 5, OS: 2,
};

function modBoxWidth(label: string): number {
  const chars = MOD_WIDTH[label] ?? label.length;
  return chars * MOD_CHAR_W + MOD_BOX_PX * 2;
}

// Outer silhouette paths for each Sonsei thumb key type (from Bazecor Key.tsx)
const THUMB_PATHS: Record<number, string> = {
  48: "M0 4.989a4 4 0 014-4h49.202a4 4 0 013.994 4.217l-2.39 43.81a4 4 0 01-3.994 3.783H4a4 4 0 01-4-4V4.989z",
  49: "M45.102 55.67a335.167 335.167 0 00-41.705-3.605 3.486 3.486 0 01-3.39-3.698L2.88 3.743A4 4 0 016.872 0h51.252c2.635 0 4.55 2.503 3.861 5.046L49.014 52.943a3.461 3.461 0 01-3.912 2.726z",
  50: "M2.662 57.508a160.536 160.536 0 0134.165 12.66 3.438 3.438 0 004.481-1.256l31.202-49.79a3.507 3.507 0 00-1.376-4.954C53.5 5.164 35.095.958 15.318.007a3.51 3.51 0 00-3.652 2.774L.078 53.406a3.485 3.485 0 002.513 4.102h.071z",
  51: "M1.484 56.77a113.488 113.488 0 0125.225 23.891 3.368 3.368 0 004.71.666l42.113-29.81a3.447 3.447 0 001.355-1.953 3.476 3.476 0 00-.225-2.374C68.256 33.426 52.758 12.032 35.99.574a3.445 3.445 0 00-2.656-.49 3.482 3.482 0 00-2.197 1.583L.519 52.063a3.522 3.522 0 00-.446 2.548c.18.876.685 1.648 1.412 2.16z",
  56: "M73.516 56.77a113.488 113.488 0 00-25.225 23.891 3.368 3.368 0 01-4.71.666L1.468 51.517a3.447 3.447 0 01-1.355-1.953 3.476 3.476 0 01.225-2.374C6.744 33.426 22.242 12.032 39.01.574a3.445 3.445 0 012.656-.49 3.482 3.482 0 012.197 1.583l30.618 50.396c.466.76.626 1.672.446 2.548a3.497 3.497 0 01-1.412 2.16z",
  57: "M70.368 57.508a160.536 160.536 0 00-34.165 12.66 3.438 3.438 0 01-4.481-1.256L.52 19.122a3.51 3.51 0 011.375-4.954C19.53 5.164 37.936.958 57.714.007a3.51 3.51 0 013.65 2.774l11.588 50.625a3.485 3.485 0 01-2.513 4.102h-.071z",
  58: "M17.25 55.67a335.168 335.168 0 0141.705-3.605 3.486 3.486 0 003.39-3.698L59.472 3.743A4 4 0 0055.48 0H4.227C1.593 0-.323 2.503.367 5.046l12.971 47.897a3.462 3.462 0 003.912 2.726z",
  59: "M57.426 4a4 4 0 00-4-4H4.224A4 4 0 00.23 4.218l2.39 43.81a4 4 0 003.994 3.782h46.812a4 4 0 004-4V4z",
};

// Approximate visual center [x, y] and rotation (degrees) for each thumb key label
const THUMB_TEXT: Record<number, [number, number, number]> = {
  48: [28, 25,   0],  // sonsei-t1:  rect, horizontal
  49: [28, 22, -12],  // defy-t2:    tapered, slight angle
  50: [32, 30, -24],  // defy-t3:    arc
  51: [26, 32, -38],  // defy-t4:    fan, most angled
  56: [48, 32,  38],  // defy-tR4:   fan mirrored
  57: [38, 30,  24],  // defy-tR3:   arc mirrored
  58: [33, 22,  12],  // defy-tR2:   tapered mirrored
  59: [28, 24,   0],  // sonsei-tR1: rect, horizontal
};

function lum(r: number, g: number, b: number) { return 0.299 * r + 0.587 * g + 0.114 * b; }
function fg(r: number, g: number, b: number) { return lum(r, g, b) > 128 ? "#111" : "#eee"; }

export const KeyboardView: React.FC<Props> = ({ model, activeLayer, layout, layerNames }) => {
  const overrides = layoutOverrides(layout);
  const layer = Math.min(activeLayer, model.keymap.length - 1);
  const keymapLayer = model.keymap[layer] ?? [];
  const colormapLayer = model.colormap[layer] ?? [];
  const palette = model.palette;
  const names = model.layerNames?.length ? model.layerNames : (layerNames ?? []);
  const macroNames = model.macroNames ?? [];

  function getColor(ledIndex: number) {
    const pi = colormapLayer[ledIndex] ?? 0;
    const c = palette[pi] ?? { r: 30, g: 30, b: 30, rgb: "rgb(30,30,30)" };
    return { r: c.r, g: c.g, b: c.b, css: c.rgb };
  }

  function getLabel(keyIndex: number) {
    const code = keymapLayer[keyIndex] ?? 0;
    const sk = superkeyIndex(code);
    if (sk !== null) {
      const name = model.superkeyNames?.[sk] || `SK${sk + 1}`;
      return { primary: "Super", subtitle: name, hold: "" };
    }
    return decodeKey(code, overrides, names, macroNames);
  }

  function renderKey(key: (typeof SONSEI_KEYS)[0]) {
    const color = getColor(key.ledIndex);
    const label = getLabel(key.index);
    const fgColor = fg(color.r, color.g, color.b);
    const hasSub = Boolean(label.subtitle);
    const mods = label.modifiers ?? [];
    const hasMods = mods.length > 0;

    const thumbPath = THUMB_PATHS[key.index];
    if (thumbPath) {
      const [tx, ty, tr] = THUMB_TEXT[key.index] ?? [28, 24, 0];
      const rot = tr === 0 ? undefined : `rotate(${tr},${tx},${ty})`;
      let thumbLabel: JSX.Element | null = null;
      if (hasSub) {
        thumbLabel = (
          <g transform={rot}>
            <text x={tx} y={ty - 6} textAnchor="middle" dominantBaseline="middle"
              fontSize={FSS} fontWeight="700" fontFamily="system-ui,-apple-system,sans-serif"
              fill={fgColor} pointerEvents="none">{label.primary}</text>
            <text x={tx} y={ty + 6} textAnchor="middle" dominantBaseline="middle"
              fontSize={FSS} fontWeight="700" fontFamily="system-ui,-apple-system,sans-serif"
              fill={fgColor} pointerEvents="none">{label.subtitle}</text>
          </g>
        );
      } else if (label.primary) {
        thumbLabel = (
          <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
            transform={rot} fontSize={FS} fontWeight="700"
            fontFamily="system-ui,-apple-system,sans-serif"
            fill={fgColor} pointerEvents="none">{label.primary}</text>
        );
      }
      return (
        <g key={`k-${key.index}`} transform={`translate(${key.x},${key.y})`}>
          <path d={thumbPath} fill="#303949" />
          <path d={thumbPath} fill={color.css} />
          {thumbLabel}
        </g>
      );
    }

    const { x, y, w, h } = key;
    const cx = x + 4 + (w - 8) / 2;
    const cy = y + (h - 8) / 2;

    let primaryY = cy + 1;
    if (hasMods) primaryY = cy - 5;
    else if (label.hold) primaryY = cy - 2;

    let primaryContent: JSX.Element | null = null;
    if (hasSub) {
      primaryContent = (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
            fontSize={FSS} fontWeight="700" fontFamily="system-ui,-apple-system,sans-serif"
            fill={fgColor} pointerEvents="none">{label.primary}</text>
          <text x={cx} y={cy + 6} textAnchor="middle" dominantBaseline="middle"
            fontSize={FSS} fontWeight="700" fontFamily="system-ui,-apple-system,sans-serif"
            fill={fgColor} pointerEvents="none">{label.subtitle}</text>
        </>
      );
    } else if (label.primary) {
      primaryContent = (
        <text x={cx} y={primaryY} textAnchor="middle" dominantBaseline="middle"
          fontSize={FS} fontWeight="700" fontFamily="system-ui,-apple-system,sans-serif"
          fill={fgColor} pointerEvents="none">{label.primary}</text>
      );
    }

    let secondaryContent: JSX.Element[] | JSX.Element | null = null;
    if (hasMods) {
      const totalW = mods.reduce((s, m) => s + modBoxWidth(m), 0) + MOD_BOX_GAP * (mods.length - 1);
      const boxY = y + h - 6 - MOD_BOX_H;
      let bx = cx - totalW / 2;
      secondaryContent = mods.map((m) => {
        const bw = modBoxWidth(m);
        const el = (
          <g key={m}>
            <rect x={bx} y={boxY} width={bw} height={MOD_BOX_H} rx={2}
              fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />
            <text x={bx + bw / 2} y={boxY + MOD_BOX_H / 2 + 0.5}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={MOD_BOX_FS} fontWeight="600"
              fontFamily="system-ui,-apple-system,sans-serif"
              fill={fgColor} pointerEvents="none">{m}</text>
          </g>
        );
        bx += bw + MOD_BOX_GAP;
        return el;
      });
    } else if (label.hold) {
      secondaryContent = (
        <text x={cx} y={y + h - 10} textAnchor="middle" dominantBaseline="middle"
          fontSize={FSH} fontWeight="600" fontFamily="system-ui,-apple-system,sans-serif"
          fill={fgColor} opacity={0.7} pointerEvents="none">{label.hold}</text>
      );
    }

    return (
      <g key={`k-${key.index}`}>
        <rect x={x} y={y} width={w} height={h} rx={4} fill="#303949" />
        <rect x={x + 4} y={y} width={w - 8} height={h - 8} rx={4} fill={color.css} />
        {primaryContent}
        {secondaryContent}
      </g>
    );
  }

  const leftKeys = SONSEI_KEYS.filter((k) => k.group === "left");
  const rightKeys = SONSEI_KEYS.filter((k) => k.group === "right");
  const layerName = names[layer] ?? `Layer ${layer}`;

  return (
    <div className="keyboard-view">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 ${VIEW_Y} ${SVG_W} ${VIEW_H}`}
        style={{ width: "100%", display: "block" }}>
        <g id="keyshapes-left" transform="rotate(10, 320, 680)">
          {leftKeys.map(renderKey)}
        </g>
        <g id="keyshapes-right" transform="rotate(-10, 960, 680)">
          {rightKeys.map(renderKey)}
        </g>
        <text x={SVG_W / 2} y={VIEW_Y + VIEW_H - 12} textAnchor="middle" fontSize={13}
          fill="rgba(255,255,255,0.35)" fontFamily="system-ui,-apple-system,sans-serif"
          className="layer-label">{layerName}</text>
      </svg>
    </div>
  );
};
