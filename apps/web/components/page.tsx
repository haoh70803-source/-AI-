import { Card } from "@content-center/ui";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-7">
      <h1 className="page-heading">{title}</h1>
      <p className="page-description">{description}</p>
    </header>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="grid min-h-64 place-items-center p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
    </Card>
  );
}
