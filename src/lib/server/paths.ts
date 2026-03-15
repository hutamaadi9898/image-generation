export function buildLoraArtifactKey(characterSlug: string, versionNumber: number): string {
  return `${characterSlug}/v${versionNumber}/lora.safetensors`;
}

export function buildBootstrapOutputPrefix(characterSlug: string, jobId: string): string {
  return `${characterSlug}/bootstrap/${jobId}`;
}

export function buildGenerationOutputPrefix(characterSlug: string, jobId: string): string {
  return `${characterSlug}/generations/${jobId}`;
}

export function buildApprovedDatasetKey(characterSlug: string, referenceImageId: string): string {
  return `${characterSlug}/dataset/${referenceImageId}.png`;
}
