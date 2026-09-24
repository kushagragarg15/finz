import { z } from "zod";
import { runAnalyst } from "@/lib/ai/analyst";
import { aiEnabled } from "@/lib/ai/groq";
import { buildWorkspace } from "@/lib/finance/workspace";
import { errorResponse, parseWorkspaceInput } from "@/lib/server/input";

export const maxDuration = 60;

const Body = z.object({
  workspace: z.unknown(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1),
});

export async function POST(req: Request) {
  if (!aiEnabled()) return errorResponse("AI analyst is disabled: set GROQ_API_KEY on the server.", 503);
  try {
    const body = Body.parse(await req.json());
    // Numbers are always recomputed server-side from raw data + corrections.
    const ws = buildWorkspace(parseWorkspaceInput(body.workspace));
    return Response.json(await runAnalyst(ws, body.messages));
  } catch (e) {
    return errorResponse(e, 500);
  }
}
