/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mongodb', 'basic-ftp', 'bcryptjs'],
  images: {
    // 이미지는 FTP(오픈호스팅) 공개 URL로 서빙되므로 외부 호스트 허용
    remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
