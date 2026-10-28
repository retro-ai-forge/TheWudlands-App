import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    const rewrites = [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];

    if (process.env.NODE_ENV !== "production") {
      // Dev: proxy the Twine editor to its vite dev server (started alongside Next
      // by `npm run dev`). public/twine doesn't exist in dev, so every /twine/*
      // request misses the filesystem and falls through to here.
      rewrites.push(
        { source: "/twine", destination: "http://localhost:5173/twine/" },
        { source: "/twine/:path*", destination: "http://localhost:5173/twine/:path*" }
      );
    } else {
      // Prod: the editor is served statically from public/twine/. Asset requests
      // (/twine/assets/*, /twine/story-formats/*, …) hit those files directly;
      // only the entry URL /twine/ needs mapping to its index.html, since Next
      // doesn't auto-serve a directory index.
      rewrites.push(
        { source: "/twine", destination: "/twine/index.html" },
        { source: "/twine/", destination: "/twine/index.html" }
      );
    }

    return rewrites;
  },
};

export default nextConfig;
