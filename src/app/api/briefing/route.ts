import { z } from "zod";
import { runBriefing } from "@/lib/ai/briefing";
import { aiEnabled } from "@/lib/ai/groq";
import { buildWorkspace } from "@/lib/finance/workspace";
import { errorResponse, parseWorkspaceInput } from "@/lib/server/input";

export const maxDuration = 30;

const Body = z.object({ workspace: z.unknown() });

export async function POST(req: Request) {
  if (!aiEnabled()) return errorResponse("AI is disabled: set GROQ_API_KEY on the server.", 503);
  try {
    const body = Body.parse(await req.json());
    return Response.json(await runBriefing(buildWorkspace(parseWorkspaceInput(body.workspace))));
  } catch (e) {
    return errorResponse(e, 500);
  }
}
