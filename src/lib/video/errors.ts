export class VideoProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "VideoProviderError";
    this.status = status;
  }
}
