import { resolve } from "node:path";

export interface BackendConfig {
  host: string;
  port: number;
  frontendOrigin: string;
  solanaCluster: string;
  solanaRpcUrl: string;
  databasePath: string;
  nodeEnv: string;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseOrigin(value: string | undefined): string {
  const origin = new URL(value ?? "http://localhost:5173");
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("FRONTEND_ORIGIN must contain only an origin");
  }
  return origin.origin;
}

function parseRpcUrl(value: string | undefined): string {
  const rpcUrl = new URL(value ?? "http://127.0.0.1:8899");
  if (rpcUrl.protocol !== "http:" && rpcUrl.protocol !== "https:") {
    throw new Error("SOLANA_RPC_URL must use HTTP or HTTPS");
  }
  return rpcUrl.toString();
}

export function loadBackendConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  const databasePath = env.DATABASE_PATH ?? "./data/marketplace.sqlite";

  return {
    host: env.HOST ?? "127.0.0.1",
    port: parsePort(env.PORT),
    frontendOrigin: parseOrigin(env.FRONTEND_ORIGIN),
    solanaCluster: env.SOLANA_CLUSTER ?? "localnet",
    solanaRpcUrl: parseRpcUrl(env.SOLANA_RPC_URL),
    databasePath:
      databasePath === ":memory:" ? databasePath : resolve(databasePath),
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
