// src/lib/rag.ts
export type RagContext = {
  context_chunks: Array<{ content: string; score: number }>;
  product_info: {
    name: string;
    description: string;
    price: number;
    specs: Record<string, any>;
  };
};

export async function fetchRagContext({
  productId,
  userQuery,
}: {
  productId: string;
  userQuery: string;
}): Promise<RagContext> {
  const ragEndpoint = import.meta.env.VITE_RAG_ENDPOINT;

  if (!ragEndpoint) {
    // MOCK para desarrollo si no hay endpoint
    return {
      context_chunks: [
        { content: 'This product features high-quality materials and excellent craftsmanship.', score: 0.95 },
        { content: 'Customers frequently praise the durability and value for money.', score: 0.87 },
      ],
      product_info: {
        name: 'Product Name',
        description: 'Product description',
        price: 0,
        specs: {},
      },
    };
  }

  const res = await fetch(ragEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, user_query: userQuery }),
  });
  if (!res.ok) throw new Error(`RAG endpoint returned ${res.status}`);
  return (await res.json()) as RagContext;
}
