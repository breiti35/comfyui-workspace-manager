// @ts-ignore
import { deleteFile } from "./Api";
export function formatTimestamp(
  unixTimestamp: number,
  showSec: boolean = false,
) {
  // Create a new Date object from the UNIX timestamp
  const date = new Date(unixTimestamp);

  // Get the day, month, year, hours, and minutes from the Date object
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Month is 0-indexed
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  // Format the date and time string
  const res = `${month}-${day}-${year} ${hours}:${minutes}`;
  if (showSec) {
    return res + `:${seconds}`;
  }
  return res;
}

export function KBtoGB(kilobytes: number, decimalPlaces: number = 1) {
  const KB_IN_MB = 1024;
  const MB_IN_GB = 1024;
  // Convert KB to MB
  const sizeInMB = kilobytes / KB_IN_MB;

  // If size is larger than or equal to 1 GB, format it in GB
  if (sizeInMB >= MB_IN_GB) {
    return (sizeInMB / MB_IN_GB).toFixed(decimalPlaces) + " GB";
  }
  // Otherwise, format it in MB
  else {
    return sizeInMB.toFixed(decimalPlaces) + " MB";
  }
}

// Keep scrolling but hide the scrollbar (modern, no chunky native bar).
// Chakra `sx` value - works in Chrome/Firefox/Edge.
export const hideScrollbarSx = {
  scrollbarWidth: "none" as const,
  msOverflowStyle: "none" as const,
  "&::-webkit-scrollbar": { display: "none" },
};

// fro folder_path.py
export const modelExtensions = [
  "ckpt",
  "pt",
  "bin",
  "pth",
  "safetensors",
  "onnx",
];

// Compact human-readable counts for the discovery cards, e.g. 12_400 -> "12.4k".
export function formatCount(n?: number): string {
  if (n == null) return "0";
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
