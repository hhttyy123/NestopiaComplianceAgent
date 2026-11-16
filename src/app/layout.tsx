import type { Metadata } from 'next';
import './apple.css';
import './content.css';
import './glass.css';
import './focus.css';
import './research.css';
export const metadata: Metadata = { title: 'Nestopia · 合规工作台', description: '有依据、可追溯的建筑项目合规预审工作台' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
