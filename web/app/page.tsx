import { RunsList } from '@/components/runs-list';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center p-8 md:p-24">
      <div className="w-full max-w-7xl">
        <h2 className="text-2xl font-bold mb-4">Recent Missions</h2>
        <RunsList />
      </div>
    </div>
  );
}
