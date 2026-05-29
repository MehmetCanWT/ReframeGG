import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === "production" ? "/ReframeGG" : "",
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
