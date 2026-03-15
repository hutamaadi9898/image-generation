import { describe, expect, it } from "vitest";
import { buildWebhookDedupeKey, isTrainingReady, mapProviderStatusToJobStatus } from "../src/lib/server/job-state";

describe("job state helpers", () => {
  it("maps provider states to internal job states", () => {
    expect(mapProviderStatusToJobStatus("IN_QUEUE")).toBe("queued");
    expect(mapProviderStatusToJobStatus("IN_PROGRESS")).toBe("running");
    expect(mapProviderStatusToJobStatus("COMPLETED")).toBe("succeeded");
    expect(mapProviderStatusToJobStatus("FAILED")).toBe("failed");
  });

  it("marks a dataset training-ready at 20 approvals", () => {
    expect(isTrainingReady(19)).toBe(false);
    expect(isTrainingReady(20)).toBe(true);
  });

  it("prefers explicit provider event ids for webhook dedupe", () => {
    expect(
      buildWebhookDedupeKey({
        providerEventId: "evt_123",
        providerJobId: "job_1",
        status: "COMPLETED",
        output: { images: 4 }
      })
    ).toBe("evt_123");

    expect(
      buildWebhookDedupeKey({
        providerJobId: "job_1",
        status: "COMPLETED",
        output: { images: 4 }
      })
    ).toBe('job_1:COMPLETED:{"images":4}');
  });
});
