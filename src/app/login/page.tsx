import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { LoginForm } from '../../components/auth/LoginForm';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-10">
      <div className="mb-10 flex flex-col items-center gap-4 pt-6">
        <Image
          src="/logo.png"
          alt="Les Manèges Ravoire"
          width={200}
          height={56}
          priority
          className="h-14 w-auto"
          style={{ width: 'auto' }}
        />
        <div className="text-center">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary, #1a1a1a)' }}
          >
            Connexion
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Email et mot de passe (username)
          </p>
        </div>
      </div>
      <LoginForm />
    </div>
  );
}
