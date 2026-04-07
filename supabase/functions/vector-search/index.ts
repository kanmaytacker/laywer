import { pipeline } from "npm:@xenova/transformers@2.17.2";
import { createClient } from "jsr:@supabase/supabase-js@2";

const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const query: string = body?.query || "";
    const matchCount: number = Number(body?.match_count || 5);
    const filter: Record<string, unknown> = body?.filter || {};
    if (!query.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const embedding = await model.run(query, {
      mean_pool: true,
      normalize: true,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data, error } = await supabase
      .schema("docs")
      .rpc("match_page_sections", {
        query_embedding: embedding,
        match_count: matchCount,
        filter,
      });

    if (error) throw error;

    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
