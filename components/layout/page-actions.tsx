type PageActionsProps = {
  children: React.ReactNode;
};

export function PageActions({ children }: PageActionsProps) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
