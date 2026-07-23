import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { ARMADA_SHARED_VERSION } from '@armada/shared';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
});

const env = envSchema.parse(process.env);

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'armada-api',
    shared: ARMADA_SHARED_VERSION,
  }));

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
