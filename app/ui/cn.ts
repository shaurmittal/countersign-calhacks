// Class-name helper used by the app UI (pattern from EasyUI, MIT: github.com/Surajmaurya1/easyui).
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
