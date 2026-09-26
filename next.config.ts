import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1 while bound on 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Two reference images can exceed the default buffered body size.
    proxyClientMaxBodySize: "20mb",
  },
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
