'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: '정산 대시보드' },
  { href: '/order-forms', label: '발주요청서' },
];

export default function Nav() {
  const path = usePathname() || '/';
  const isOn = (href) => (href === '/' ? path === '/' || path.startsWith('/settlements') : path.startsWith(href));
  return (
    <div className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="https://yogibo.kr/web/img/icon/logo3_on.png" alt="요기보" />
          <span className="brand-txt">정산 시스템<em>현대드림애드</em></span>
        </Link>
        <div className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={isOn(l.href) ? 'on' : ''}>{l.label}</Link>
          ))}
        </div>
        <div className="who">마케팅디자인팀</div>
      </div>
    </div>
  );
}
