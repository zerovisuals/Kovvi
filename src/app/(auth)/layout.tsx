import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-page flex min-h-dvh flex-col">
      <header className="px-6 py-6 md:px-10">
        <Link href="/" className="inline-flex">
          <Wordmark height={17} />
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
