/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Atenção: Isso permite o build mesmo com erros de lint. 
    // Útil para desenvolvimento rápido e demonstração.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Atenção: Isso permite o build mesmo com erros de tipagem.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
