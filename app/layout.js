import './globals.css';
import Nav from './_components/Nav';

export const metadata = {
  title: '요기보 그래픽 정산 관리',
  description: '발주요청서 생성 + 월별 그래픽 대금 정산 (현대드림애드)',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
