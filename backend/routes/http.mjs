import { state } from "../state.mjs";

export default async function httpRoutes(fastify) {
  fastify.get("/health", async (_req, reply) => {
    reply.send({ ok: true, running: state.renodeRunning });
  });
}
