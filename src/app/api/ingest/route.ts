import { aiCategorize } from "@/lib/ai/categorize";
import { aiEnabled } from "@/lib/ai/groq";
import { parseWorkbook } from "@/lib/finance/ingest";
import type { AiSuggestionMap } from "@/lib/finance/ledger";
import { errorResponse } from "@/lib/server/input";

export const maxDuration = 60;

/** Parse the uploaded bank file, then get an independent AI opinion per transaction pattern. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("No file uploaded");
    if (file.size > 5 * 1024 * 1024) return errorResponse("File too large (max 5 MB)");
    const parsed = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
    if (!parsed.transactions.length) return errorResponse("No transactions found in file");

    let ai: AiSuggestionMap = {};
    let aiStatus: "ok" | "disabled" | "failed" = aiEnabled() ? "ok" : "disabled";
    let aiError: string | undefined;
    if (aiEnabled()) {
      try {
        ai = await aiCategorize(parsed.transactions);
      } catch (e) {
        aiStatus = "failed";
        aiError = (e as Error).message;
      }
    }
    return Response.json({ fileName: file.name, ...parsed, ai, aiStatus, aiError });
  } catch (e) {
    return errorResponse(e);
  }
}
