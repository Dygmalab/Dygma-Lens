import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardView } from "./KeyboardView";
import type { KeyboardModel, LensSettings, LensState } from "../shared/types";

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
  const isDragging = useRef(false);
  const appRef = useRef<HTMLDivElement>(null);
  const keyboardSizerRef = useRef<HTMLDivElement>(null);

  const setHovered = useCallback((v: boolean) => {
    console.log(`[Lens/Renderer] setHovered(${v}), hasAppRef=${!!appRef.current}, currentClasses=${appRef.current?.className}`);
    if (v) {
      appRef.current?.classList.add("hovered");
      console.log(`[Lens/Renderer] After add: ${appRef.current?.className}`);
    } else {
      appRef.current?.classList.remove("hovered");
      console.log(`[Lens/Renderer] After remove: ${appRef.current?.className}`);
    }
  }, []);

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
    const offSettings = window.lens.onSettings((s) => {
      console.log('[Lens/Renderer] Settings updated:', s);
      setSettings(s);
    });

    return () => {
      offModel();
      offLayer();
      offSettings();
    };
  }, []);

  useEffect(() => {
    if (settings) {
      console.log(`[Lens/Renderer] Settings effect: hoverMode=${settings.hoverMode}, body.classList=${document.body.className}`);
      
      // When hover mode changes, sync the .hovered class based on whether mouse is currently over the keyboard
      if (settings.hoverMode) {
        // Check if mouse is currently over the keyboard element
        const isMouseOver = keyboardSizerRef.current?.matches(':hover');
        console.log(`[Lens/Renderer] Hover mode enabled, isMouseOver=${isMouseOver}`);
        if (isMouseOver) {
          console.log('[Lens/Renderer] Forcing setHovered(true) because mouse is already over keyboard');
          setHovered(true);
        }
      } else {
        // When hover mode is disabled, remove .hovered
        console.log('[Lens/Renderer] Hover mode disabled, removing .hovered');
        setHovered(false);
      }
    }
  }, [settings?.hoverMode, setHovered]);

  if (!settings) return null;

  if (!configFound || !model) {
    console.log(`[Lens/Renderer] Showing waiting screen: configFound=${configFound}, hasModel=${!!model}`);
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
  
  console.log(`[Lens/Renderer] Rendering keyboard: activeLayer=${activeLayer}, hoverMode=${settings.hoverMode}`);

  const layerNames = model.layerNames?.length ? model.layerNames : settings.layerNames;

  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    console.log(`[Lens/Renderer] handleBoardMouseDown: hoverMode=${settings?.hoverMode}, button=${e.button}`);
    if (!settings?.hoverMode || e.button !== 0) return;
    console.log('[Lens/Renderer] Starting drag');
    e.preventDefault();
    isDragging.current = true;
    // Capture the cursor's offset inside the window once. Each move sets the
    // window's top-left to (cursorScreen - grabOffset) absolutely, so the grab
    // point stays under the cursor and errors never accumulate (delta tracking
    // drifted because main read the position back from getBounds each frame).
    const grabX = e.screenX - window.screenX;
    const grabY = e.screenY - window.screenY;
    const onMove = (ev: MouseEvent) => {
      window.lens?.winMove(ev.screenX - grabX, ev.screenY - grabY);
    };
    const onUp = () => {
      console.log('[Lens/Renderer] Drag ended (mouseup)');
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      
      // After dragging, check if mouse is still over the app element
      // If not, manually trigger setHovered(false) since onMouseLeave won't fire
      setTimeout(() => {
        const isMouseOver = keyboardSizerRef.current?.matches(':hover');
        const bounds = keyboardSizerRef.current?.getBoundingClientRect();
        console.log(`[Lens/Renderer] After drag, isMouseOver=${isMouseOver}, bounds:`, bounds);
        if (!isMouseOver && settings?.hoverMode) {
          console.log('[Lens/Renderer] Mouse not over app after drag, forcing setHovered(false)');
          setHovered(false);
        }
      }, 50);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      ref={appRef}
      className="app"
    >
      <div className="board" 
        onMouseDown={handleBoardMouseDown}
      >
        <div 
          ref={keyboardSizerRef}
          className="keyboard-sizer"
          onMouseEnter={() => {
            console.log(`[Lens/Renderer] onMouseEnter (keyboard): hoverMode=${settings?.hoverMode}`);
            if (settings?.hoverMode) setHovered(true);
          }}
          onMouseLeave={() => {
            console.log(`[Lens/Renderer] onMouseLeave (keyboard): isDragging=${isDragging.current}, resizing=${document.body.classList.contains("resizing")}`);
            if (!isDragging.current && !document.body.classList.contains("resizing"))
              setHovered(false);
          }}
        >
          <KeyboardView
            model={model}
            activeLayer={activeLayer}
            layout={settings.layout}
            layerNames={layerNames}
          />
          <ResizeFrame />
        </div>
      </div>
    </div>
  );
}
