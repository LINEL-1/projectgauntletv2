import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Investment Committee Simulator', description: 'A weekly AI investment committee for a simulated CAD portfolio.' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }
