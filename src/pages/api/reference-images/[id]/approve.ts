import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, badRequest } from "../../../../lib/server/http";
import { createRepository } from "../../../../lib/server/repository";
import { asString, readRequestPayload } from "../../../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const repository = createRepository(env);
  if (!repository) {
    return json({ ok: false, message: "D1 is not configured." }, { status: 503 });
  }

  const reference = await repository.getReferenceImage(params.id ?? "");
  if (!reference) {
    return badRequest("Reference image not found.");
  }

  const payload = await readRequestPayload(request);
  const decision = asString(payload.decision, "approved");
  if (decision !== "approved" && decision !== "rejected") {
    return badRequest("Decision must be `approved` or `rejected`.");
  }

  const updated = await repository.setReferenceImageDecision(
    reference.id,
    decision,
    asString(payload.reviewerNotes)
  );

  const approvedCount = await repository.countApprovedReferences(reference.characterId);
  if (approvedCount >= 20) {
    await repository.db
      .prepare(
        "UPDATE characters SET status = 'dataset_ready', updated_at = ?2 WHERE id = ?1 AND status != 'ready'"
      )
      .bind(reference.characterId, new Date().toISOString())
      .run();
  }

  return json({ ok: true, referenceImage: updated, approvedCount });
};
