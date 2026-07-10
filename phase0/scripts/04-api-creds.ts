// Step 4 — derive (or create) the user-level CLOB API credentials for the
// spike signer. In prod this happens once per user at provisioning time.
import { saveState } from "../lib/env";
import { makeTempClobClient } from "../lib/clients";

async function main() {
  const temp = makeTempClobClient();

  let creds = await temp.deriveApiKey().catch(() => null);
  if (creds?.key && creds?.secret && creds?.passphrase) {
    console.log("Derived existing user API credentials.");
  } else {
    creds = await temp.createApiKey();
    if (!creds?.key) throw new Error(`createApiKey failed: ${JSON.stringify(creds)}`);
    console.log("Created new user API credentials.");
  }

  saveState({
    apiCreds: { key: creds.key, secret: creds.secret, passphrase: creds.passphrase },
  });
  console.log("✓ Saved to .state.json (gitignored).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
