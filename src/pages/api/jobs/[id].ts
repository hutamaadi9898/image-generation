import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, badRequest } from "../../../lib/server/http";
import { syncJobStatus } from "../../../lib/server/jobs";
import { createRepository } from "../../../lib/server/repository";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const id = params.id ?? "";
  const job = await repository.getJob(id);
  if (!job) {
    return badRequest("Job not found.");
  }

  if (url.searchParams.get("sync") !== "0") {
    try {
      await syncJobStatus(env, repository, job.id);
    } catch {
      // Polling failures are non-fatal. The last persisted state is still useful to callers.
    }
  }

  const refreshed = await repository.getJob(id);
  return json({ ok: true, job: refreshed });
};
