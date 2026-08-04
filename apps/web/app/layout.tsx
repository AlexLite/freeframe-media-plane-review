import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/shared/toast";
import { ThemeInitializer } from "@/components/shared/theme-initializer";
import { LocaleInitializer } from "@/components/shared/locale-initializer";
import { LegacyLocaleBridge } from "@/components/shared/legacy-locale-bridge";
import "./globals.css";

const appFont = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  preload: true,
});

export const metadata: Metadata = {
  title: "FreeFrame",
  description: "Collaborative media review and approval platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to apply theme BEFORE paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=JSON.parse(localStorage.getItem('ff-theme')||'{}');var t=d.state&&d.state.theme||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=location.pathname.indexOf('/share/')===0;var q=new URLSearchParams(location.search).get('lang');var l;if(s){var p=localStorage.getItem('ff-public-locale');l=(q==='ru'||q==='en')?q:((p==='ru'||p==='en')?p:'ru')}else{var d=JSON.parse(localStorage.getItem('ff-locale')||'{}');l=d.state&&d.state.profileLocale||'en'}document.documentElement.lang=l}catch(e){document.documentElement.lang=location.pathname.indexOf('/share/')===0?'ru':'en'}})()`,
          }}
        />
      </head>
      <body className={`${appFont.variable} font-sans antialiased`}>
        <ThemeInitializer />
        <LocaleInitializer />
        <LegacyLocaleBridge />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
