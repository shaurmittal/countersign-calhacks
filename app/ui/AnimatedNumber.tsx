"use client";
// Rolling digits for live numbers: each digit column springs to its new value when a real row changes
// the count. Adapted from EasyUI's AnimatedNumber (MIT: github.com/Surajmaurya1/easyui) to take an
// already-formatted string, so "$4,800.00" and "0.4s" roll the same way.
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn } from "./cn";

function DigitColumn({ digit }: { digit: number }) {
  const value = useSpring(digit, { stiffness: 170, damping: 22, mass: 0.6 });
  const y = useTransform(value, (v) => `-${v * 10}%`);
  useEffect(() => value.set(digit), [value, digit]);
  return (
    <span className="relative inline-block h-[1.15em] w-[0.6em] overflow-hidden text-center leading-[1.15em]">
      <motion.span style={{ y }} className="flex flex-col">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="block h-[1.15em]">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={cn("font-mono tabular-nums", className)}>{value}</span>;
  const chars = value.split("");
  return (
    <span className={cn("inline-flex items-baseline font-mono tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
      {chars.map((ch, i) => {
        // Keyed from the right, so adding a digit on the left doesn't re-key the others.
        const key = `${chars.length - i}`;
        return /\d/.test(ch) ? (
          <DigitColumn key={key} digit={Number(ch)} />
        ) : (
          <span key={key} aria-hidden="true">
            {ch}
          </span>
        );
      })}
      </span>
    </span>
  );
}
