import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { ARMADA_SHARED_VERSION } from '@armada/shared';
import { auth } from './auth';
import { requireAuth, requireRole } from './session';
import { mergePeople } from './merge';
import { registerPeopleRoutes } from './people';
import { registerGroupRoutes } from './groups';
import { registerFilloutRoutes } from './fillout-routes';
import { registerPipelineRoutes } from './pipeline';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
});

const env = envSchema.parse(process.env);

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
  await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/' });

  // --- Better Auth handler: mount all /api/auth/* routes ------------------
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else if (value != null) headers.append(key, value);
      }

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body:
          request.method !== 'GET' && request.body != null
            ? JSON.stringify(request.body)
            : undefined,
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      // Preserve multiple Set-Cookie headers.
      const setCookies =
        typeof response.headers.getSetCookie === 'function'
          ? response.headers.getSetCookie()
          : [];
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      for (const cookie of setCookies) reply.header('set-cookie', cookie);

      reply.send(response.body ? await response.text() : null);
    },
  });

  // --- App routes ---------------------------------------------------------
  app.get('/health', async () => ({
    status: 'ok',
    service: 'armada-api',
    shared: ARMADA_SHARED_VERSION,
  }));

  app.get('/me', { preHandler: requireAuth }, async (request) => ({
    user: request.authedUser,
  }));

  // Gate check: admin-only route. Members get 403.
  app.get('/admin/ping', { preHandler: requireRole('ADMIN') }, async () => ({
    ok: true,
    scope: 'admin',
  }));

  registerPeopleRoutes(app);
  registerGroupRoutes(app);
  registerFilloutRoutes(app);
  registerPipelineRoutes(app);

  // Identity resolution: merge a duplicate person into another (§8). Admin only.
  app.post('/admin/people/:id/merge', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { intoId } = z.object({ intoId: z.string().uuid() }).parse(request.body);
    try {
      const result = await mergePeople(request.authedUser?.personId ?? null, id, intoId);
      return { ok: true, ...result };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

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

// Only auto-start when run directly (not when imported by scripts/tests).
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  void start();
} else if (require.main === module) {
  void start();
}
