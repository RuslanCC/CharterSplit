import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AppProvider } from './providers';

export const metadata: Metadata = {
  title: 'CharterSplit',
  description: 'Деление общих расходов в поездке',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // telegram-web-app.js до гидратации пишет CSS-переменные темы в style <html>.
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Официальный Telegram Mini Apps SDK. Единственная внешняя зависимость — Telegram. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
