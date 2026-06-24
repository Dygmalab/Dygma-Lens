import { EventEmitter } from "events";
import { SONSEI_VENDOR_ID } from "../shared/constants";

type SerialListenerEvents = {
  "layer-change": [event: { type: "layer"; layer: number }];
  connected: [];
  disconnected: [];
};

// Listens for overlay_layer:N lines sent by the OverlayKeyDygma firmware plugin
// over USB CDC serial (115200 baud). Used when the keyboard is connected via USB,
// where the vendor HID interface is not exposed in the USB descriptor.
export class SerialListener extends EventEmitter<SerialListenerEvents> {
  private port: import("serialport").SerialPort | null = null;
  private lineBuf = "";

  async start(): Promise<void> {
    try {
      const { SerialPort } = await import("serialport");
      const ports = await SerialPort.list();

      const vidHex = SONSEI_VENDOR_ID.toString(16).padStart(4, "0");
      const target = ports.find(
        (p) => p.vendorId?.toLowerCase() === vidHex,
      );

      if (!target) {
        console.log("[SerialListener] Sonsei not found on any serial port");
        return;
      }

      console.log("[SerialListener] connecting to", target.path);

      this.port = new SerialPort({
        path: target.path,
        baudRate: 115200,
        autoOpen: false,
      });

      this.port.on("data", (chunk: Buffer) => {
        this.lineBuf += chunk.toString();
        let nl = this.lineBuf.indexOf("\n");
        while (nl >= 0) {
          const line = this.lineBuf.slice(0, nl).replace(/\r$/, "");
          this.lineBuf = this.lineBuf.slice(nl + 1);
          this.handleLine(line);
          nl = this.lineBuf.indexOf("\n");
        }
      });

      this.port.on("close", () => {
        console.log("[SerialListener] disconnected");
        this.port = null;
        this.lineBuf = "";
        this.emit("disconnected");
      });

      this.port.on("error", (err) => {
        console.log("[SerialListener] error:", err.message);
        try { this.port?.close(); } catch { /* ignore */ }
        this.port = null;
        this.lineBuf = "";
        this.emit("disconnected");
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => (err ? reject(err) : resolve()));
      });

      console.log("[SerialListener] connected to", target.path);
      this.emit("connected");
    } catch (err) {
      console.log("[SerialListener] not available:", (err as Error).message);
    }
  }

  private handleLine(line: string): void {
    if (!line.startsWith("overlay_layer:")) return;
    const layer = Number.parseInt(line.slice("overlay_layer:".length), 10);
    if (!Number.isNaN(layer)) {
      console.log("[SerialListener] layer-change:", layer);
      this.emit("layer-change", { type: "layer", layer });
    }
  }

  stop(): void {
    try { this.port?.close(); } catch { /* ignore */ }
    this.port = null;
    this.lineBuf = "";
  }
}
