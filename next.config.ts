import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1 while bound on 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Reference images, and a source performance upload, can exceed the default body size.
    proxyClientMaxBodySize: "256mb",
  },
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
