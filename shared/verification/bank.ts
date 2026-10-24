// Bank-detail check for the Vendor Verifier (owner: P3). Spec §5 R2, §6.2.
// Pure: no I/O, no clock. It only compares; the Payer always pays the bank on file (§8.3).
import type { PaymentRequest } from "../types";
import { digitsOnly } from "./text";
import type { BookVendor } from "./types";

type BankDetails = PaymentRequest["newBankDetails"];

/** The request carries a routing or account number with at least one digit; "N/A" doesn't count. */
export function hasBankDetails(details: BankDetails): boolean {
  if (!details) return false;
  return digitsOnly(details.routing ?? "") !== "" || digitsOnly(details.account ?? "") !== "";
}

/** Last 4 digits of an account number ("...9921" -> "9921"), or null when it has fewer than 4. */
export function accountLast4(account: string | null | undefined): string | null {
  const digits = digitsOnly(account ?? "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * VendorFindings.bankMatches: null when the request carries no bank details, true only when every
 * part it supplies matches the vendor's record, false otherwise (including when no vendor matched).
 * Known limit: only the account's last 4 are on file, so a different account with the same last 4
 * counts as matching. That is safe because the Payer always pays the bank on file, never the
 * request's details.
 */
export function compareBank(details: BankDetails, vendor: BookVendor | null): boolean | null {
  if (!details || !hasBankDetails(details)) return null;
  if (!vendor) return false;
  // A part with no digits wasn't supplied. A supplied part must match, and an empty field on file never does.
  const routing = digitsOnly(details.routing ?? "");
  if (routing !== "" && routing !== digitsOnly(vendor.bankRouting)) return false;
  const account = digitsOnly(details.account ?? "");
  if (account !== "") {
    const last4 = accountLast4(account);
    if (last4 === null || last4 !== vendor.bankLast4) return false;
  }
  return true;
}
