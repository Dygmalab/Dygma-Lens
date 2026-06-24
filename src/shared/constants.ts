export const SONSEI_VENDOR_ID = 0x35ef;
export const SONSEI_PRODUCT_ID = 0x0031;

export const SONSEI_KEYS_PER_LAYER = 60;
export const SONSEI_COLOR_LAYER_SIZE = 56;
export const SONSEI_PALETTE_SIZE = 16;

export const LENS_CONFIG_PATH_SEGMENTS = [".lens", "lens-config.json"];

export const OVERLAY_MAGIC_BYTE = 0xaa;
export const OVERLAY_PACKET_SIZE = 5;

export const PACKET_TYPE_OVERLAY = 0x01;
export const PACKET_TYPE_LAYER = 0x02;

export const OVERLAY_EVENT_RELEASE = 0x00;
export const OVERLAY_EVENT_TAP = 0x01;
export const OVERLAY_EVENT_HOLD = 0x02;
export const OVERLAY_EVENT_DOUBLE_TAP = 0x03;

// HID report ID for the Raw HID / vendor interface (firmware HID_REPORTID_RAWHID).
// USB HID prepends this ID at buf[0]; BLE HID strips it.
export const SONSEI_RAW_HID_REPORT_ID = 5;
