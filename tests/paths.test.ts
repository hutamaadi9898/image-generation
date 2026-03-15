import { describe, expect, it } from "vitest";
import {
  buildApprovedDatasetKey,
  buildBootstrapOutputPrefix,
  buildGenerationOutputPrefix,
  buildLoraArtifactKey
} from "../src/lib/server/paths";

describe("artifact paths", () => {
  it("builds versioned LoRA artifacts", () => {
    expect(buildLoraArtifactKey("mara-vale", 4)).toBe("mara-vale/v4/mara-vale-v4.safetensors");
  });

  it("builds bootstrap and generation output prefixes", () => {
    expect(buildBootstrapOutputPrefix("mara-vale", "job_boot")).toBe("mara-vale/bootstrap/job_boot");
    expect(buildGenerationOutputPrefix("mara-vale", "job_gen")).toBe("mara-vale/generations/job_gen");
  });

  it("builds approved dataset paths", () => {
    expect(buildApprovedDatasetKey("mara-vale", "ref_1")).toBe("mara-vale/dataset/ref_1.png");
  });
});
