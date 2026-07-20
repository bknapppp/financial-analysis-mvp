import { PageActions } from "@/components/layout/page-actions";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  status?: React.ReactNode;
  progress?: React.ReactNode;
  actions?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  status,
  progress,
  actions
}: PageHeaderProps) {
  return (
    <header className="border-b border-bs-border-subtle bg-bs-surface px-4 py-4 md:px-6">
      <div className="mx-auto grid max-w-bs-content gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-8">
        <div className="min-w-0 max-w-4xl">
          {eyebrow ? <p className="bs-label mb-1">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="bs-page-title">{title}</h1>
            {status}
          </div>
          {description ? <p className="bs-body-text mt-1 max-w-3xl">{description}</p> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          {progress ? <div className="w-full sm:w-60 xl:w-64">{progress}</div> : null}
          {actions ? <PageActions>{actions}</PageActions> : null}
        </div>
      </div>
    </header>
  );
}
