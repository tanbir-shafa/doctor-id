import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Classname combiner used by shadcn/ui primitives. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
