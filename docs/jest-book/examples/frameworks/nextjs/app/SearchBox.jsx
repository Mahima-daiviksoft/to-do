'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
export default function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  return (
    <form onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); }}>
      <label htmlFor="q">Search</label>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="submit">Go</button>
    </form>
  );
}
