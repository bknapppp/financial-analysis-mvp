export const isDevelopment = process.env.NODE_ENV !== "production";

export function devLog(...args: Parameters<typeof console.log>) {
  if (isDevelopment) {
    console.log(...args);
  }
}

export function devWarn(...args: Parameters<typeof console.warn>) {
  if (isDevelopment) {
    console.warn(...args);
  }
}
