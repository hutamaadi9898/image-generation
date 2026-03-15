import type { MiddlewareHandler } from "astro";
import { env } from "cloudflare:workers";

function unauthorizedResponse(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Private Admin"'
    }
  });
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;

  if (!username || !password) {
    return next();
  }

  const header = context.request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  const decoded = atob(header.replace("Basic ", ""));
  const [providedUser, providedPass] = decoded.split(":");

  if (providedUser !== username || providedPass !== password) {
    return unauthorizedResponse();
  }

  return next();
};
