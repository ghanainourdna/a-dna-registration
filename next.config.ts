import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: configDir,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dcjzmoarp/**",
      },
      {
        protocol: "https",
        hostname: "cloudfront-us-east-1.images.arcpublishing.com",
        pathname: "/baltimorebanner/**",
      },
    ],
  },
};

export default nextConfig;
