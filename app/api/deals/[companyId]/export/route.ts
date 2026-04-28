import { getDashboardData } from "@/lib/data";
import { buildReportWorkbook } from "@/lib/report-export-xlsx";

type RouteContext = {
  params: Promise<{
    companyId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { companyId } = await context.params;
  const data = await getDashboardData(companyId);

  if (!data.company || !data.snapshot.periodId) {
    return new Response("Deal is not ready for export.", { status: 400 });
  }

  const workbook = await buildReportWorkbook(data);

  return new Response(workbook.buffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${workbook.filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
