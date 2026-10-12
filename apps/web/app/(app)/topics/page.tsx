import { ContentHub } from '@/components/content-hub';
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const query = await searchParams;
  return <ContentHub mode={query.view === "review" ? "review" : "topics"}/>;
}
