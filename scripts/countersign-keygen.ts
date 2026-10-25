// One-time key generation for countersigned transfers (owner: P1).  npx tsx scripts/countersign-keygen.ts
// Prints a NEW ECDSA P-256 key pair as JWKs and the commands to store them. This output is the only place
// the private key ever appears: don't paste it in chat, commit it, or put it in a web page.
//   COUNTERSIGN_SIGNING_KEY  private JWK, read only by the Payer's signer (convex/lib/countersign.ts)
//   LUMEN_BANK_VERIFY_KEY    public JWK, read only by the bank (convex/bank.ts)
// Running it again makes a different pair; set both together or every transfer is rejected.
import { generateCountersignKeys } from "../shared/bank/payload";

async function main() {
  const { privateJwk, publicJwk } = await generateCountersignKeys();
  const priv = JSON.stringify(privateJwk);
  const pub = JSON.stringify(publicJwk);

  console.log(`
  Countersign signing keys (ECDSA P-256)

  COUNTERSIGN_SIGNING_KEY (PRIVATE, keep secret):
  ${priv}

  LUMEN_BANK_VERIFY_KEY (public):
  ${pub}

  Store them on the deployment (paste each value at the hidden prompt; add --prod or --deployment as needed):

    read -s "V?COUNTERSIGN_SIGNING_KEY: " && npx convex env set COUNTERSIGN_SIGNING_KEY "$V"; unset V
    read -s "V?LUMEN_BANK_VERIFY_KEY: " && npx convex env set LUMEN_BANK_VERIFY_KEY "$V"; unset V

  Then create the bank's account and payees (non-destructive, safe on the demo deployment):

    npx convex run bank:ensureSeeded
  `);
}

void main();
