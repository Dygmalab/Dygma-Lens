import { EventEmitter } from "events";
import {
  SONSEI_VENDOR_ID,
  SONSEI_PRODUCT_ID,
  OVERLAY_MAGIC_BYTE,
  OVERLAY_PACKET_SIZE,
  PACKET_TYPE_OVERLAY,
  PACKET_TYPE_LAYER,
  SONSEI_RAW_HID_REPORT_ID,
} from "../shared/constants";

export interface OverlayEvent {
  type: "overlay";
  eventType: number;
}

export interface LayerEvent {
  type: "layer";
  layer: number;
}

type RawHidEvents = {
  overlay: [event: OverlayEvent];
  "layer-change": [event: LayerEvent];
  connected: [];
  disconnected: [];
};

const RECONNECT_INTERVAL_MS = 2000;

export class RawHidListener extends EventEmitter<RawHidEvents> {
  private device: import("node-hid").HID | null = null;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.emit("overlay", { type: "overlay", eventType: buf[base + 2] });
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
