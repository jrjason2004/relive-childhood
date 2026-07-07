/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static resolves its binary path with __dirname; bundling it
  // rewrites that to a fake /ROOT/... path. Keep it external so the require
  // happens at runtime against real node_modules (works locally and on
  // Vercel, whose file tracing copies the package incl. the binary).
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
