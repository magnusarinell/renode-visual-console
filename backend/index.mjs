import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { PORT, RENODE_MODE, RENODE_ROBOT_HOST, RENODE_ROBOT_PORT } from "./config.mjs";
import httpRoutes from "./routes/http.mjs";
import wsRoutes from "./routes/ws.mjs";

const app = Fastify({ logger: false });

await app.register(fastifyWebsocket);
await app.register(httpRoutes);
await app.register(wsRoutes);

await app.listen({ port: PORT, host: "localhost" });
console.log(`Renode bridge on http://localhost:${PORT}`);
console.log(`WebSocket server listening on ws://localhost:${PORT}`);
console.log(`Mode: ${RENODE_MODE}`);
if (RENODE_MODE === "robot") {
  console.log(`XML-RPC robot server: ${RENODE_ROBOT_HOST}:${RENODE_ROBOT_PORT}`);
}
