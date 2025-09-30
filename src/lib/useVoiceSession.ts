import { useState, useCallback } from 'react';
import { fetchRagContext } from './rag';
import { buildPrompt } from './prompt';
import { Product } from './supabaseClient';

export type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type UseVoiceSessionProps = {
  product: Product;
  onError?: (error: Error) => void;
};

export function useVoiceSession({ product, onError }: UseVoiceSessionProps) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processUserQuery = useCallback(
    async (userQuery: string) => {
      if (isProcessing) return;

      setIsProcessing(true);
      setStatus('thinking');

      // Add user message to history
      setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);

      try {
        // Fetch RAG context
        const ragContext = await fetchRagContext({
          productId: product.id,
          userQuery,
        });

        // Build prompt
        const prompt = buildPrompt({
          product,
          chunks: ragContext.context_chunks,
          userQuery,
        });

        // Simulate AI response (in production, this would call Gemini Live)
        setStatus('speaking');
        
        // Mock response for demo
        await new Promise((resolve) => setTimeout(resolve, 1500));
        
        const mockResponse = `Based on the ${product.name}, ${
          ragContext.context_chunks[0]?.content || 
          'this product offers excellent quality and value.'
        } ${userQuery.toLowerCase().includes('price') 
          ? `It's currently priced at $${product.price}.`
          : ''
        }`;

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: mockResponse },
        ]);

        setStatus('idle');
      } catch (error) {
        console.error('Error processing voice query:', error);
        setStatus('error');
        if (onError) {
          onError(error as Error);
        }
        
        // Reset to idle after showing error
        setTimeout(() => setStatus('idle'), 2000);
      } finally {
        setIsProcessing(false);
      }
    },
    [product, isProcessing, onError]
  );

  const startListening = useCallback(() => {
    setStatus('listening');
    
    // Simulate voice recognition (in production, use Web Speech API or Gemini Live)
    setTimeout(() => {
      const mockQuery = "Can you tell me more about this product's features?";
      processUserQuery(mockQuery);
    }, 2000);
  }, [processUserQuery]);

  const stopListening = useCallback(() => {
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessages([]);
    setIsProcessing(false);
  }, []);

  return {
    status,
    messages,
    isProcessing,
    startListening,
    stopListening,
    processUserQuery,
    reset,
  };
}
