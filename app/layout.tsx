import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_KR({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-noto" });

export const metadata: Metadata = {
  title: "내집마련 계산기",
  description: "내 자금 상태와 대출 규제로 매물 매수 가능성을 계산하고, 시세를 감시하며 에이전트가 매수 여부를 판정합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={noto.variable}>
      <body>{children}</body>
    </html>
  );
}
