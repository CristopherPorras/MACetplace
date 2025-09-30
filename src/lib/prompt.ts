import { Product } from './supabaseClient';
import { RagContext } from './rag';

export function buildPrompt({
  product,
  chunks,
  userQuery,
}: {
  product: Product;
  chunks: RagContext['context_chunks'];
  userQuery: string;
}): string {
  const systemRule = `You are a helpful AI shopping assistant. Be concise, helpful, and accurate. If you don't have information about something, say "I don't have that information" rather than making up an answer. Focus on helping the customer make an informed decision.`;

  const productSummary = `
Product: ${product.name}
Price: $${product.price}
Description: ${product.description}
Key Features: ${Object.entries(product.specs || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')}
  `.trim();

  const contextInfo =
    chunks && chunks.length > 0
      ? `\n\nAdditional Context:\n${chunks
          .slice(0, 3)
          .map((chunk, i) => `${i + 1}. ${chunk.content}`)
          .join('\n')}`
      : '';

  return `${systemRule}

${productSummary}${contextInfo}

Customer Question: ${userQuery}

Please provide a helpful, accurate answer based on the product information and context provided.`;
}
