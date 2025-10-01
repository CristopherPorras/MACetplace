// supabase/functions/rag/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Req = { product_id?: string; user_query?: string };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const { product_id } = (await req.json()) as Req;
    if (!product_id) return new Response("Missing product_id", { status: 400 });

    // Traer el producto real
    const prod = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${product_id}&select=id,name,description,price,image_url,category,specs`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!prod.ok) return new Response("Error fetching product", { status: 500 });
    const [p] = await prod.json();

    if (!p) return new Response("Product not found", { status: 404 });

    const specsStr = p?.specs ? JSON.stringify(p.specs) : "";
    const context_chunks = [{ content: [p.description || "", specsStr, p.category ? `Category: ${p.category}` : ""].filter(Boolean).join("\n").slice(0, 2000), score: 0.5 }];

    const payload = {
      product_info: {
        id: p.id, name: p.name, description: p.description, price: p.price,
        image_url: p.image_url, category: p.category, specs: p.specs
      },
      context_chunks
    };
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response("RAG error", { status: 500 });
  }
});
