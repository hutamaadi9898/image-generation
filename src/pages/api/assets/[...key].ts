import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { assertArtifacts } from "../../../lib/server/config";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const bucket = assertArtifacts(env);
  const rawKey = params.key ?? "";
  const object = await bucket.get(rawKey);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/png",
      "cache-control": "private, max-age=60"
    }
  });
};
