import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repositoryRoot, "target/idl/ad_marketplace.json");
const destination = resolve(
  repositoryRoot,
  "app/public/idl/ad_marketplace.json",
);
const requiredInstructions = new Set([
  "initialize_config",
  "create_listing",
  "verify_supplier_kyb",
  "place_bid",
  "claim_funds",
]);

if (!existsSync(source)) {
  throw new Error(
    "Generated Anchor IDL is missing. Run `anchor build` before syncing it.",
  );
}

let idl;
try {
  idl = JSON.parse(readFileSync(source, "utf8"));
} catch (error) {
  throw new Error(`Could not parse generated Anchor IDL at ${source}.`, {
    cause: error,
  });
}

if (
  typeof idl.address !== "string" ||
  !Array.isArray(idl.instructions) ||
  !Array.isArray(idl.accounts)
) {
  throw new Error(
    `Generated Anchor IDL at ${source} is missing required data.`,
  );
}

const missingInstructions = [...requiredInstructions].filter(
  (instruction) =>
    !idl.instructions.some((entry) => entry.name === instruction),
);
if (missingInstructions.length > 0) {
  throw new Error(
    `Generated Anchor IDL is stale; missing: ${missingInstructions.join(", ")}. Run \`anchor build\` again.`,
  );
}

const anchorToml = readFileSync(resolve(repositoryRoot, "Anchor.toml"), "utf8");
const localnetProgramId = anchorToml.match(
  /^\[programs\.localnet\][\s\S]*?^\s*ad_marketplace\s*=\s*"([^"]+)"/m,
)?.[1];
if (!localnetProgramId) {
  throw new Error("Could not find ad_marketplace under [programs.localnet].");
}
if (idl.address !== localnetProgramId) {
  throw new Error(
    `IDL address ${idl.address} does not match Anchor.toml Localnet address ${localnetProgramId}.`,
  );
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`Synced ${source} to ${destination} for Localnet.`);
