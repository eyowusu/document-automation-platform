import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Workspace from '@/components/workspace';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <Workspace user={{ email: user.email, name: user.name, role: user.role }} />;
}
