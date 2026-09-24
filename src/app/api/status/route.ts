import { GROQ_MODEL, aiEnabled } from "@/lib/ai/groq";

export async function GET() {
  return Response.json({ aiEnabled: aiEnabled(), model: GROQ_MODEL });
}
