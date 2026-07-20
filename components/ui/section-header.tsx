type SectionHeaderProps = {
  title: string;
  description?: string;
  count?: number;
  actions?: React.ReactNode;
};

export function SectionHeader({
  title,
  description,
  count,
  actions
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bs-border-subtle pb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="bs-section-title">{title}</h2>
          {count !== undefined ? (
            <span className="bs-metadata rounded-full bg-bs-page px-2 py-0.5 tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
        {description ? <p className="bs-metadata mt-0.5">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
