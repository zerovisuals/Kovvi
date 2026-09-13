import type { Metadata } from 'next';
import { CredentialsForm } from '@/components/auth/CredentialsForm';
import { signIn } from '@/server/auth/actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return <CredentialsForm mode="sign-in" action={signIn} />;
}
