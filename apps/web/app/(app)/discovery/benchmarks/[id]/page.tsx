import { redirect } from "next/navigation";
export default async function BenchmarkCompatibilityPage({ params }: { params: Promise<{ id: string }> }) { redirect(`/research/benchmarks/${encodeURIComponent((await params).id)}`); }
