import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Two reference images can exceed the default buffered body size.
    proxyClientMaxBodySize: "20mb",
  },
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
