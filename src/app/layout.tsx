import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReguScape - מידע תכנוני על נכסים',
  description: 'מערכת לחיפוש מידע תכנוני על נכסים בישראל',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
