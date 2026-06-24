import { EventEmitter } from "events";
import {
  SONSEI_VENDOR_ID,
  SONSEI_PRODUCT_ID,
  OVERLAY_MAGIC_BYTE,
  OVERLAY_PACKET_SIZE,
  PACKET_TYPE_OVERLAY,
  PACKET_TYPE_LAYER,
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

export class RawHidListener extends EventEmitter<RawHidEvents> {
  private device: import("node-hid").HID | null = null;
  private running = false;

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
        return;
      }
      this.device = new HID.HID(target.path);
      this.running = true;
      this.emit("connected");
      this.device.on("data", (buf: Buffer) => this.onData(buf));
      this.device.on("error", () => {
        this.device = null;
        this.running = false;
        this.emit("disconnected");
      });
    } catch {
      // node-hid not available or device not found – silently skip
    }
  }

  private onData(buf: Buffer): void {
    if (buf.length < OVERLAY_PACKET_SIZE) return;
    if (buf[0] !== OVERLAY_MAGIC_BYTE) return;

    const packetType = buf[1];
    if (packetType === PACKET_TYPE_OVERLAY) {
      this.emit("overlay", { type: "overlay", eventType: buf[2] });
    } else if (packetType === PACKET_TYPE_LAYER) {
      this.emit("layer-change", { type: "layer", layer: buf[2] });
    }
  }

  stop(): void {
    this.running = false;
    try {
      this.device?.close();
    } catch {
      // ignore
    }
    this.device = null;
  }
}
