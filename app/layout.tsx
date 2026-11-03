import './globals.css';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/sonner';
import {ChunkLoadErrorHandler} from '@/components/chunk-load-error-handler';
export const metadata={title:'Acuren | Tank Integrity Services',description:'Explore aboveground storage tank inspection technologies in 3D.',manifest:'/manifest.webmanifest',icons:{icon:'/branding/acuren-logo.svg',shortcut:'/branding/acuren-logo.svg',apple:'/branding/acuren-icon-192.png'},appleWebApp:{capable:true,title:'Acuren TankScope'},openGraph:{title:'Acuren — Tank Integrity Services',description:'An interactive guide to storage tank inspection.',images:['/branding/acuren-social.png']}};
export const viewport={themeColor:'#002B5C'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><head><script src="https://apps.abacus.ai/chatllm/appllm-lib.js" async /></head><body className="font-sans"><ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false}>{children}<Toaster/><ChunkLoadErrorHandler/></ThemeProvider></body></html>;}
