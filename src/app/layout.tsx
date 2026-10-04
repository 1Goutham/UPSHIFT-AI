import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "@fontsource/anonymous-pro/400.css";
import "@fontsource/anonymous-pro/700.css";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "UPSHIFT AI", template: "%s · UPSHIFT AI" },
  description: "Get more out of every AI. Turn vague intentions into clear briefs, stronger prompts and verified results.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

// Applied before paint so the chosen theme never flashes.
const THEME_SCRIPT = `try{var t=localStorage.getItem("upshift-theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={{ ["--font-outfit" as string]: "'Outfit Variable'", ["--font-anonymous-pro" as string]: "'Anonymous Pro'" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
