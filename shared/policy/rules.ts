import type { RuleId } from "../types";

/** Rule catalogue from spec §5. The UI and the audit log show these descriptions. */
export const RULES: Record<RuleId, { name: string; description: string; overridable: boolean }> = {
  R1: { name: "Unknown vendor", description: "No vendor-book match", overridable: true },
  R2: { name: "Bank change", description: "New or different bank details: callback, then owner", overridable: true },
  R3: { name: "Sender not on file", description: "Sender phone/email not in the vendor's record", overridable: true },
  R4: { name: "Amount anomaly", description: "Amount outside the typical range by more than 25%", overridable: true },
  R5: { name: "No matching invoice", description: "No open invoice with that number/amount", overridable: true },
  R6: { name: "Over auto-pay limit", description: "Amount above the auto-pay limit", overridable: true },
  R7: { name: "Large payment", description: "OTP plus cooling-off delay", overridable: true },
  R8: { name: "Sanctions", description: "OFAC hit", overridable: false },
  R9: { name: "Forbidden rails", description: "Gift cards, crypto, wire to a personal account", overridable: false },
  R10: { name: "Callback denied", description: "Vendor on file says they did not send it", overridable: true },
  R11: { name: "Owner claim", description: "Requester claims to be the owner; claim ignored", overridable: true },
  R12: { name: "Happy path", description: "Known vendor, bank on file, open invoice, under limit", overridable: true },
};
