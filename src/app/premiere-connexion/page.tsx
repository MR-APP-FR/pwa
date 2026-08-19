import { redirect } from 'next/navigation';
import { requireEmployeeSession } from '../../lib/auth/employee';
import { NewPasswordForm } from '../../components/auth/NewPasswordForm';

export default async function PremiereConnexionPage() {
  const session = await requireEmployeeSession();
  if (!session.ok) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-10">
      <NewPasswordForm />
    </div>
  );
}
