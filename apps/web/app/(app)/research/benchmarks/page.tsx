import { BenchmarkWorkspace, type BenchmarkQuery } from "@/components/research/benchmark-workspace";

export default function ResearchBenchmarks({ searchParams }: { searchParams: Promise<BenchmarkQuery> }) {
  return <BenchmarkWorkspace searchParams={searchParams} />;
}
