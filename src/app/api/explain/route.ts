import { z } from "zod";
import { narrateVariance } from "@/lib/ai/narrate";
import { buildWorkspace } from "@/lib/finance/workspace";
import { errorResponse, parseWorkspaceInput } from "@/lib/server/input";

export const maxDuration = 30;

const Body = z.object({ workspace: z.unknown(), varianceId: z.string() });

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const ws = buildWorkspace(parseWorkspaceInput(body.workspace));
    const v = ws.variances.find((x) => x.id === body.varianceId);
    if (!v) return errorResponse("Variance not found", 404);
    return Response.json(await narrateVariance(v));
  } catch (e) {
    return errorResponse(e, 500);
  }
}
