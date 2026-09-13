import type { Metadata } from 'next';
import { CredentialsForm } from '@/components/auth/CredentialsForm';
import { signUp } from '@/server/auth/actions';

export const metadata: Metadata = { title: 'Create workspace' };

export default function SignUpPage() {
  return <CredentialsForm mode="sign-up" action={signUp} />;
}
