import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: [
      path.join(process.cwd(), 'node_modules'),
      path.join(process.cwd(), 'node_modules/bootstrap/scss'),
    ],
    silenceDeprecations: ['import', 'if-function'],
  },
};

export default nextConfig;
