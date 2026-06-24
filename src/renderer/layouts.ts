export const LAYOUT_DE: Record<number, string> = {
  45: "ß", 46: "´", 47: "ü", 48: "+", 49: "#",
  51: "ö", 52: "ä", 53: "^", 54: ",", 55: ".", 56: "-",
  100: "<",
};

export const LAYOUT_ES: Record<number, string> = {
  45: "'", 46: "¡", 47: "`", 48: "+", 49: "ç",
  51: "ñ", 52: "´", 53: "º", 54: ",", 55: ".", 56: "-",
  100: "<",
};

export const LAYOUT_FR: Record<number, string> = {
  30: "&", 31: "é", 32: '"', 33: "'", 34: "(",
  35: "-", 36: "è", 37: "_", 38: "ç", 39: "à",
  45: ")", 46: "=", 47: "^", 48: "$", 49: "*",
  51: "m", 52: "ù", 53: "²", 54: ";", 55: ":", 56: "!",
  100: "<",
};

export const LAYOUTS: Record<string, Record<number, string>> = {
  us: {},
  de: LAYOUT_DE,
  es: LAYOUT_ES,
  fr: LAYOUT_FR,
};

export function layoutOverrides(layout: string): Record<number, string> {
  return LAYOUTS[layout] ?? {};
}
