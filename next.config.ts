import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['sql.js'], poweredByHeader: false, outputFileTracingExcludes: { '*': ['./data/**/*', './tmp/**/*'] } };
export default config;
