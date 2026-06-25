import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardView } from "./KeyboardView";
import type { KeyboardModel, LensSettings, LensState } from "../shared/types";
import { LAYOUTS } from "./layouts";

const LAYERS_MAX = 10;

const RESIZE_DIRS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"] as const;
type ResizeDir = (typeof RESIZE_DIRS)[number];

function ResizeFrame() {
  function startResize(dir: ResizeDir) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add("resizing");
      let lastX = e.clientX;
      let lastY = e.clientY;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        window.lens?.winResize(dir, dx, dy);
      };
      const onUp = () => {
        document.body.classList.remove("resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }
  return (
    <div className="resize-frame">
      <div className="resize-border" />
      {RESIZE_DIRS.map((dir) => (
        <div key={dir} className={`resize-handle resize-${dir}`} onMouseDown={startResize(dir)} />
      ))}
    </div>
  );
}

export function App() {
  const [model, setModel] = useState<KeyboardModel | null>(null);
  const [activeLayer, setActiveLayer] = useState(0);
  const [settings, setSettings] = useState<LensSettings | null>(null);
  const [configFound, setConfigFound] = useState(false);
  const [layerPickerOpen, setLayerPickerOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const isDragging = useRef(false);
  const appRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const opacityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.lens) return;

    window.lens.getState().then((s: LensState) => {
      if (s.model) setModel(s.model);
      setActiveLayer(s.activeLayer);
      setConfigFound(s.configFound);
    });
    window.lens.getSettings().then((s: LensSettings) => setSettings(s));

    const offModel = window.lens.onModel((m) => {
      setModel(m);
      setConfigFound(true);
    });
    const offLayer = window.lens.onActiveLayer((l) => setActiveLayer(l));
    const offSettings = window.lens.onSettings((s) => setSettings(s));

    return () => {
      offModel();
      offLayer();
      offSettings();
    };
  }, []);

  const closePopovers = useCallback((e: MouseEvent) => {
    if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
      setLayerPickerOpen(false);
    }
    if (opacityRef.current && !opacityRef.current.contains(e.target as Node)) {
      setOpacityOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", closePopovers);
    return () => document.removeEventListener("mousedown", closePopovers);
  }, [closePopovers]);

  if (!settings) return <div className="centered">Loading…</div>;

  if (!configFound || !model) {
    return (
      <div className="app">
        <div className="centered" style={{ flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#eef2f7" }}>Waiting for Bazecor…</div>
          <div style={{ fontSize: 14, color: "#6b7280", maxWidth: 320, textAlign: "center" }}>
            Open Bazecor with a Sonsei keyboard connected to generate the config file.
          </div>
        </div>
      </div>
    );
  }

  const layerCount = model.keymap.length || 1;
  const layerNames = model.layerNames?.length ? model.layerNames : settings.layerNames;

  function layerLabel(i: number): string {
    return layerNames[i] || `Layer ${i}`;
  }

  function setHovered(v: boolean) {
    if (v) appRef.current?.classList.add("hovered");
    else appRef.current?.classList.remove("hovered");
  }

  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!settings?.hoverMode || e.button !== 0) return;
    e.preventDefault();
    isDragging.current = true;
    const startCursorX = e.screenX;
    const startCursorY = e.screenY;
    const startWinX = window.screenX;
    const startWinY = window.screenY;
    const onMove = (ev: MouseEvent) => {
      window.lens?.winMove(
        startWinX + (ev.screenX - startCursorX),
        startWinY + (ev.screenY - startCursorY),
      );
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      ref={appRef}
      className="app"
      onMouseEnter={() => settings?.hoverMode && setHovered(true)}
      onMouseLeave={() => {
        if (!isDragging.current && !document.body.classList.contains("resizing"))
          setHovered(false);
      }}
    >
      <div className="toolbar">
        <div className="toolbar-left">
          <div ref={pickerRef} style={{ position: "relative" }}>
            <button
              className="layer-pill"
              aria-expanded={layerPickerOpen}
              onClick={() => setLayerPickerOpen((v) => !v)}
            >
              {layerLabel(activeLayer)}
            </button>
            {layerPickerOpen && (
              <div className="popover layer-popover">
                <h2>Layers</h2>
                {Array.from({ length: layerCount }, (_, i) => (
                  <div
                    key={i}
                    className={`layer-row${i === activeLayer ? " active" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setActiveLayer(i);
                      setLayerPickerOpen(false);
                    }}
                  >
                    <span>{layerLabel(i)}</span>
                    <input
                      type="text"
                      value={layerNames[i] ?? ""}
                      placeholder={`Layer ${i}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (!window.lens) return;
                        window.lens
                          .setLayerName(i, e.target.value)
                          .then((s: LensSettings) => setSettings(s));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <select
            className="layout-select"
            value={settings.layout}
            onChange={(e) => {
              if (!window.lens) return;
              window.lens.setLayout(e.target.value).then((s: LensSettings) => setSettings(s));
            }}
          >
            {Object.keys(LAYOUTS).map((k) => (
              <option key={k} value={k}>
                {k.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-end">
          <div className="toolbar-actions" ref={opacityRef as React.RefObject<HTMLDivElement>}>
            <button
              className={`icon-button${settings.overlayMode ? " active" : ""}`}
              title="Overlay mode"
              onClick={() => {
                if (!window.lens) return;
                window.lens.setOverlay(!settings.overlayMode).then((s: LensSettings) => setSettings(s));
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18M9 3v18" />
              </svg>
            </button>
            <button
              className={`icon-button${settings.hoverMode ? " active" : ""}`}
              title="Hover mode (drag & resize in overlay)"
              onClick={() => {
                if (!window.lens) return;
                window.lens.setHoverMode(!settings.hoverMode).then((s: LensSettings) => setSettings(s));
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </button>
            <button
              className="icon-button"
              title="Overlay opacity"
              onClick={() => setOpacityOpen((v) => !v)}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 010 18V3z" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {opacityOpen && (
              <div className="popover opacity-popover">
                <div className="popover-title">
                  <h2>Overlay Opacity</h2>
                  <span>{Math.round(settings.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(settings.opacity * 100)}
                  onChange={(e) => {
                    if (!window.lens) return;
                    const v = Number(e.target.value) / 100;
                    window.lens.setOpacity(v).then((s: LensSettings) => setSettings(s));
                  }}
                />
                <div className="range-dots">
                  {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="window-controls">
            <button className="wc-btn wc-minimize" title="Minimize" onClick={() => window.lens?.winMinimize()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5.5" width="12" height="1" fill="currentColor" /></svg>
            </button>
            <button className="wc-btn wc-maximize" title="Maximize" onClick={() => window.lens?.winMaximize()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
            </button>
            <button className="wc-btn wc-close" title="Close" onClick={() => window.lens?.winClose()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className={`board${settings.overlayMode ? " dimmed" : ""}`} onMouseDown={handleBoardMouseDown}>
        <div className="keyboard-sizer">
          <KeyboardView
            model={model}
            activeLayer={activeLayer}
            layout={settings.layout}
            layerNames={settings.layerNames}
          />
          <ResizeFrame />
        </div>
      </div>
    </div>
  );
}

void LAYERS_MAX;
