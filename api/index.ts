// Keep Vercel's project root at the repository root so pnpm workspace packages,
// the lockfile, and the Prisma schema are all inside the build boundary.
export { default } from '../apps/api/api/index.ts';