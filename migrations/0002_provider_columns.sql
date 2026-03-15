ALTER TABLE generation_jobs RENAME COLUMN runpod_endpoint_id TO provider_endpoint;
ALTER TABLE generation_jobs RENAME COLUMN runpod_job_id TO provider_job_id;
