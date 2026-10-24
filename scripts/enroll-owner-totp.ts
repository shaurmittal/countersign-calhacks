// One-time setup of the owner's step-up codes (spec §6.5). Run on a trusted laptop:
//   npm run enroll:owner -- "Priya Raman"
// It prints a NEW secret. Add it to the authenticator app on the owner's phone, then store it only
// in Convex. Never commit it, paste it in chat, or put it in a web page. Running it again creates
// a different secret; the old one stops working once OWNER_TOTP_SECRET is replaced.
import { newTotpEnrollment } from "../shared/totp";

const label = process.argv[2] ?? "Owner";
const { secretBase32, uri } = newTotpEnrollment(label);

console.log(`
Countersign owner enrollment for "${label}"

1. In the authenticator app (Google Authenticator, 1Password, Authy...), add an account:
     Setup key:  ${secretBase32}
     Type:       time-based, 6 digits, 30 seconds
   Or show a QR code to scan (needs qrencode: brew install qrencode):
     qrencode -t ansiutf8 '${uri}'

2. Store the secret in Convex (dev and prod deployments):
     npx convex env set OWNER_TOTP_SECRET ${secretBase32}

3. Open /owner on the phone. Codes from the app now approve, decline and cancel payments.
`);
