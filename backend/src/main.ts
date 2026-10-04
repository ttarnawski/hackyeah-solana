import "dotenv/config";
import { loadBackendConfig } from "./config.js";
import { purgeLegacyDraftStorage } from "./database.js";
import { buildServer } from "./server.js";

const config = loadBackendConfig();
purgeLegacyDraftStorage(config.databasePath);
const server = buildServer({ config });

await server.listen({ host: config.host, port: config.port });
