// Motion tokens for the app UI. Adapted from EasyUI's motion-tokens (MIT: github.com/Surajmaurya1/easyui).
// Product motion conveys state only: a row arriving, a verdict landing, a pill moving to the selection.
import type { Transition } from "framer-motion";

export const spring = {
  /** Rows and panels settling into place: near-critical damping, no bounce. */
  smooth: { type: "spring", stiffness: 200, damping: 28, mass: 0.85 } as Transition,
  /** Hover and selection pills: fast, light. */
  snappy: { type: "spring", stiffness: 380, damping: 30, mass: 0.5 } as Transition,
  /** Shared-layout moves (the active nav pill, the selected strip). */
  morph: { type: "spring", stiffness: 220, damping: 32, mass: 1 } as Transition,
};

export const ease = {
  soft: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as Transition,
  fast: { duration: 0.2, ease: [0.2, 0, 0, 1] } as Transition,
};
