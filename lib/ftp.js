import { Client } from 'basic-ftp';
import { Readable } from 'node:stream';

/**
 * 버퍼를 FTP(오픈호스팅)에 업로드하고 공개 URL을 반환한다.
 * @param {Buffer} buffer  업로드할 파일 데이터
 * @param {string} filename 저장할 파일명 (확장자 포함)
 * @returns {Promise<string>} 공개 접근 URL
 */
export async function uploadToFtp(buffer, filename) {
  const {
    FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FTP_SECURE,
    FTP_UPLOAD_DIR, PUBLIC_IMAGE_BASE,
  } = process.env;

  if (!FTP_HOST || !FTP_USER) {
    throw new Error('FTP 환경변수(FTP_HOST/FTP_USER 등)가 설정되지 않았습니다.');
  }

  const client = new Client(30_000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: FTP_HOST,
      port: Number(FTP_PORT) || 21,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: String(FTP_SECURE) === 'true',
    });

    const dir = FTP_UPLOAD_DIR || '/';
    await client.ensureDir(dir); // 없으면 생성 + 해당 디렉터리로 이동
    await client.uploadFrom(Readable.from(buffer), filename);

    const base = (PUBLIC_IMAGE_BASE || '').replace(/\/+$/, '');
    return `${base}/${filename}`;
  } finally {
    client.close();
  }
}

/** FTP 상의 파일 삭제 (이미지 교체/제거 시) */
export async function deleteFromFtp(filename) {
  const { FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FTP_SECURE, FTP_UPLOAD_DIR } = process.env;
  if (!FTP_HOST || !FTP_USER) return;
  const client = new Client(30_000);
  try {
    await client.access({
      host: FTP_HOST,
      port: Number(FTP_PORT) || 21,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: String(FTP_SECURE) === 'true',
    });
    const dir = FTP_UPLOAD_DIR || '/';
    await client.remove(`${dir.replace(/\/+$/, '')}/${filename}`).catch(() => {});
  } finally {
    client.close();
  }
}
