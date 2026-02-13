import { exportKeypair, importKeypair, saveKeypair } from "./keypair.js";
import type { TavernKeypair } from "./keypair.js";

interface TavernKeyFile {
  version: number;
  type: "tavern-keypair-export";
  publicKeyHex: string;
  privateKeyHex: string;
  exportedAt: string;
}

const KEY_FILE_VERSION = 1;
const KEY_FILE_TYPE = "tavern-keypair-export";

export async function exportKeypairToFile(keypair: TavernKeypair): Promise<void> {
  const exported = await exportKeypair(keypair);
  const payload: TavernKeyFile = {
    version: KEY_FILE_VERSION,
    type: KEY_FILE_TYPE,
    publicKeyHex: exported.publicKeyHex,
    privateKeyHex: exported.privateKeyHex,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const prefix = exported.publicKeyHex.slice(0, 8);

  anchor.href = url;
  anchor.download = `tavern-identity-${prefix}.tavern-key`;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  console.log("[identity] Keypair exported to file");
}

function isValidTavernKeyFile(value: unknown): value is TavernKeyFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.version === KEY_FILE_VERSION &&
    candidate.type === KEY_FILE_TYPE &&
    typeof candidate.publicKeyHex === "string" &&
    typeof candidate.privateKeyHex === "string" &&
    typeof candidate.exportedAt === "string"
  );
}

export async function importKeypairFromFile(file: File): Promise<TavernKeypair> {
  const raw = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid key file: could not parse JSON");
  }

  if (!isValidTavernKeyFile(parsed)) {
    throw new Error("Invalid key file: missing or invalid required fields");
  }

  const imported = await importKeypair({
    publicKeyHex: parsed.publicKeyHex,
    privateKeyHex: parsed.privateKeyHex
  });

  await saveKeypair(imported);
  console.log("[identity] Keypair imported from file");
  return imported;
}
