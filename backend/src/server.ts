import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createSolanaRpc } from "@solana/kit";
import type { BackendConfig } from "./config.js";

interface ServerDependencies {
  config: BackendConfig;
}

export function buildServer({ config }: ServerDependencies): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
  });
  const rpc = createSolanaRpc(config.solanaRpcUrl);

  app.register(cors, {
    origin: config.frontendOrigin,
    methods: ["GET", "OPTIONS"],
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/solana/status", async (_request, reply) => {
    try {
      const [slot, genesisHash] = await Promise.all([
        rpc.getSlot().send(),
        rpc.getGenesisHash().send(),
      ]);
      return {
        cluster: config.solanaCluster,
        slot: String(slot),
        genesisHash: String(genesisHash),
      };
    } catch (error) {
      app.log.error({ err: error }, "Solana RPC health request failed");
      return reply.code(503).send({
        code: "SOLANA_RPC_UNAVAILABLE",
        message: "The configured Solana RPC endpoint could not be reached.",
      });
    }
  });

  return app;
}
