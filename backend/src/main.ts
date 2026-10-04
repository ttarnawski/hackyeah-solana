import "dotenv/config";
import { loadBackendConfig } from "./config.js";
import { MarketplaceDatabase } from "./database.js";
import { buildServer } from "./server.js";

const config = loadBackendConfig();
const database = new MarketplaceDatabase(config.databasePath);
const server = buildServer({ config, database });

server.addHook("onClose", async () => {
  database.close();
});

await server.listen({ host: config.host, port: config.port });
