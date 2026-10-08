import { redirect } from "next/navigation";

export default async function ProjectStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard?project=${encodeURIComponent(id)}`);
}
