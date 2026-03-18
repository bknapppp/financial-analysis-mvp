import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();

  return <DashboardShell data={data} />;
}
