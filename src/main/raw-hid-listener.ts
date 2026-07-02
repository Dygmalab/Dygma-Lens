import { EventEmitter } from "events";
import {
  SONSEI_VENDOR_ID,
  SONSEI_PRODUCT_ID,
  OVERLAY_MAGIC_BYTE,
  OVERLAY_PACKET_SIZE,
  PACKET_TYPE_OVERLAY,
  PACKET_TYPE_LAYER,
  PACKET_TYPE_OVERLAY_TAP,
  PACKET_TYPE_OVERLAY_HOLD,
  SONSEI_RAW_HID_REPORT_ID,
} from "../shared/constants";

export interface OverlayEvent {
  type: "overlay";
  eventType: number;
}

export interface OverlayTapEvent {
  type: "overlay-tap";
  eventType: number;
}

export interface OverlayHoldEvent {
  type: "overlay-hold";
  eventType: number;
}

export interface LayerEvent {
  type: "layer";
  layer: number;
}

type RawHidEvents = {
  overlay: [event: OverlayEvent];
  "overlay-tap": [event: OverlayTapEvent];
  "overlay-hold": [event: OverlayHoldEvent];
  "layer-change": [event: LayerEvent];
  connected: [];
  disconnected: [];
};

const RECONNECT_INTERVAL_MS = 2000;

const DEBOUNCE_MS: Record<number, number> = {
  0x00: 80,   // RELEASE
  0x01: 150,  // TAP
  0x02: 150,  // HOLD
  0x03: 400,  // DOUBLE_TAP
};
const DEFAULT_DEBOUNCE_MS = 150;

export class RawHidListener extends EventEmitter<RawHidEvents> {
  private device: import("node-hid").HID | null = null;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventTime: Record<string, number> = {};

  // Debounces per (source, eventType) pair so bouncy/duplicate packets from a
  // single physical press can't fire the same handler twice in quick succession.
  private shouldEmit(source: string, eventType: number): boolean {
    const key = `${source}:${eventType}`;
    const now = Date.now();
    const debounce = DEBOUNCE_MS[eventType] ?? DEFAULT_DEBOUNCE_MS;
    const last = this.lastEventTime[key] ?? 0;
    if (now - last < debounce) {
      console.log(`[HID] ${source} eventType=0x${eventType.toString(16)} debounced (${now - last}ms < ${debounce}ms)`);
      return false;
    }
    this.lastEventTime[key] = now;
    return true;
  }

  async start(): Promise<void> {
    try {
      const HID = await import("node-hid");
      const devices = HID.devices();
      const target = devices.find(
        (d) =>
          d.vendorId === SONSEI_VENDOR_ID &&
          d.productId === SONSEI_PRODUCT_ID &&
          d.usagePage === 0xff00 &&
          d.usage === 0x01,
      );
      if (!target || !target.path) {
        console.log("[HID] Device not found (VID=0x%s PID=0x%s usagePage=0xff00 usage=0x01)",
          SONSEI_VENDOR_ID.toString(16), SONSEI_PRODUCT_ID.toString(16));
        console.log("[HID] Available devices:", devices.map(d => `VID=${d.vendorId?.toString(16)} PID=${d.productId?.toString(16)} usage=${d.usagePage}/${d.usage}`));
        return;
      }
      console.log(`[HID] Device opened: ${target.path}`);
      this.device = new HID.HID(target.path);
      this.running = true;
      this.emit("connected");
      this.device.on("data", (buf: Buffer) => this.onData(buf));
      this.device.on("error", () => {
        this.device = null;
        this.running = false;
        this.emit("disconnected");
        console.log("[HID] Device disconnected, scheduling reconnect...");
        this.scheduleReconnect();
      });
    } catch (err) {
      console.log("[HID] start() error:", err);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log("[HID] Attempting reconnect...");
      await this.start();
      if (!this.running) this.scheduleReconnect();
    }, RECONNECT_INTERVAL_MS);
  }

  private onData(buf: Buffer): void {
    console.log(`[HID] raw packet (${buf.length}b): ${buf.slice(0, 8).toString("hex")}`);

    if (buf.length < OVERLAY_PACKET_SIZE) {
      console.log(`[HID] packet too short: ${buf.length} < ${OVERLAY_PACKET_SIZE}`);
      return;
    }

    // USB HID prepends the report ID at buf[0]; BLE HID does not.
    const base = buf[0] === SONSEI_RAW_HID_REPORT_ID ? 1 : 0;
    console.log(`[HID] base=${base} buf[base]=0x${buf[base]?.toString(16)} magic=0x${OVERLAY_MAGIC_BYTE.toString(16)}`);

    if (buf[base] !== OVERLAY_MAGIC_BYTE) {
      console.log("[HID] magic byte mismatch, skipping");
      return;
    }

    const packetType = buf[base + 1];
    console.log(`[HID] packetType=0x${packetType?.toString(16)} payload=0x${buf[base + 2]?.toString(16)}`);

    if (packetType === PACKET_TYPE_OVERLAY) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay", eventType)) return;
      console.log(`[HID] emitting overlay (OVERLAY_KEY superkey): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay", { type: "overlay", eventType });
    } else if (packetType === PACKET_TYPE_OVERLAY_TAP) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay-tap", eventType)) return;
      console.log(`[HID] emitting overlay-tap (OVERLAY_TAP key): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay-tap", { type: "overlay-tap", eventType });
    } else if (packetType === PACKET_TYPE_OVERLAY_HOLD) {
      const eventType = buf[base + 2];
      if (!this.shouldEmit("overlay-hold", eventType)) return;
      console.log(`[HID] emitting overlay-hold (OVERLAY_HOLD key): eventType=0x${eventType.toString(16)}`);
      this.emit("overlay-hold", { type: "overlay-hold", eventType });
    } else if (packetType === PACKET_TYPE_LAYER) {
      console.log(`[HID] emitting layer-change: layer=${buf[base + 2]}`);
      this.emit("layer-change", { type: "layer", layer: buf[base + 2] });
    }
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.device?.close();
    } catch {
      // ignore
    }
    this.device = null;
  }
}
