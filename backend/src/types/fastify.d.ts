import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedWallet: string | null;
  }
}
