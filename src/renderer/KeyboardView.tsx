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
const SVG_H = 560;
const KEY_RX = 6;
const FONT_SIZE_PRIMARY = 13;
const FONT_SIZE_HOLD = 9;
const STROKE_DEFAULT = "rgba(255,255,255,0.18)";
const STROKE_ACTIVE = "rgba(255,255,255,0.55)";

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function textColor(r: number, g: number, b: number): string {
  return luminance(r, g, b) > 128 ? "#111" : "#eee";
}

export const KeyboardView: React.FC<Props> = ({ model, activeLayer, layout, layerNames }) => {
  const overrides = layoutOverrides(layout);
  const layer = Math.min(activeLayer, model.keymap.length - 1);
  const keymapLayer = model.keymap[layer] ?? [];
  const colormapLayer = model.colormap[layer] ?? [];
  const palette = model.palette;

  function getColor(ledIndex: number): { r: number; g: number; b: number; css: string } {
    const paletteIdx = colormapLayer[ledIndex] ?? 0;
    const color = palette[paletteIdx] ?? { r: 30, g: 30, b: 30, rgb: "rgb(30,30,30)" };
    return { r: color.r, g: color.g, b: color.b, css: color.rgb };
  }

  function getLabel(keyIndex: number): { primary: string; hold: string } {
    const code = keymapLayer[keyIndex] ?? 0;
    const sk = superkeyIndex(code);
    if (sk !== null) {
      const skActions = model.superkeys[sk];
      if (skActions && skActions[0]) {
        const tap = decodeKey(skActions[0], overrides);
        return { primary: tap.primary || `SK${sk}`, hold: "SK" };
      }
      return { primary: `SK${sk}`, hold: "SK" };
    }
    return decodeKey(code, overrides);
  }

  function renderKey(key: (typeof SONSEI_KEYS)[0]) {
    const color = getColor(key.ledIndex);
    const label = getLabel(key.index);
    const fill = color.css;
    const stroke = STROKE_DEFAULT;
    const fg = textColor(color.r, color.g, color.b);
    const cx = key.x + key.w / 2;
    const cy = key.y + key.h / 2;

    return (
      <g key={`k-${key.index}`}>
        <rect
          x={key.x}
          y={key.y}
          width={key.w}
          height={key.h}
          rx={KEY_RX}
          ry={KEY_RX}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
        {label.primary && (
          <text
            x={cx}
            y={label.hold ? cy - 1 : cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={FONT_SIZE_PRIMARY}
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill={fg}
            pointerEvents="none"
          >
            {label.primary}
          </text>
        )}
        {label.hold && (
          <text
            x={cx}
            y={key.y + key.h - 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={FONT_SIZE_HOLD}
            fontWeight="600"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill={fg}
            opacity={0.7}
            pointerEvents="none"
          >
            {label.hold}
          </text>
        )}
      </g>
    );
  }

  const leftKeys = SONSEI_KEYS.filter((k) => k.group === "left");
  const rightKeys = SONSEI_KEYS.filter((k) => k.group === "right");

  const layerName = layerNames?.[layer] ?? `Layer ${layer}`;

  return (
    <div className="keyboard-view" style={{ width: "100%", height: "100%" }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <g id="keyshapes-left" transform="rotate(10, 320, 680)">
          {leftKeys.map(renderKey)}
        </g>
        <g id="keyshapes-right" transform="rotate(-10, 960, 680)">
          {rightKeys.map(renderKey)}
        </g>
        <text
          x={SVG_W / 2}
          y={SVG_H - 12}
          textAnchor="middle"
          fontSize={13}
          fill="rgba(255,255,255,0.35)"
          fontFamily="system-ui, -apple-system, sans-serif"
          className="layer-label"
        >
          {layerName}
        </text>
      </svg>
    </div>
  );
};

void STROKE_ACTIVE;
