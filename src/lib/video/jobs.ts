import { randomUUID } from "node:crypto";
import { VideoProviderError } from "@/lib/video/errors";
import { getVideoProvider, type GenerateInput, type GenerateResult } from "@/lib/video/provider";

export type JobSnapshot = {
  status: "running" | "done" | "error";
  progress: number;
  message: string;
  error?: string;
  statusCode?: number;
  result?: GenerateResult;
};

const jobs = new Map<string, JobSnapshot>();

export function startJob(input: GenerateInput): string {
  const id = randomUUID();
  const job: JobSnapshot = { status: "running", progress: 0.02, message: "Starting the recast…" };
  jobs.set(id, job);
  void runJob(job, input);
  return id;
}

export function readJob(id: string): JobSnapshot | null {
  return jobs.get(id) ?? null;
}

async function runJob(job: JobSnapshot, input: GenerateInput) {
  try {
    job.result = await getVideoProvider().generate(input, (message) => {
      job.message = message;
      const frame = message.match(/frame (\d+) of (\d+)/);
      if (frame) {
        const index = Number(frame[1]);
        const total = Number(frame[2]) || 1;
        job.progress = 0.12 + (0.8 * index) / total;
      } else if (message.startsWith("Downloading")) {
        job.progress = 0.08;
      } else if (message.startsWith("Joining")) {
        job.progress = 0.94;
      }
    });
    job.status = "done";
    job.progress = 1;
    job.message = "The performance is ready.";
    setTimeout(() => {
      if (jobs.get(jobIdOf(job)) === job) jobs.delete(jobIdOf(job));
    }, 15 * 60 * 1000).unref?.();
  } catch (error) {
    job.status = "error";
    job.statusCode = error instanceof VideoProviderError ? error.status : 500;
    job.error = error instanceof VideoProviderError ? error.message : "The performance could not be recast.";
    if (!(error instanceof VideoProviderError)) console.error("MIGO recast failed", error);
  }
}

function jobIdOf(job: JobSnapshot): string {
  for (const [id, value] of jobs) {
    if (value === job) return id;
  }
  return "";
}
