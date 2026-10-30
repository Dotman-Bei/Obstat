// The model list handed to Mozaik. It is Mozaik's own supportedModels, with one fix for Gemini.
//
// Gemini 3 attaches a thought signature to each function call and expects it back with that call on the next turn;
// Mozaik 4.1.0's Gemini mapper drops it. This wraps the mapper to keep each signature by call ID and put it back,
// and gives calls an ID when Gemini sends none, so two calls never share one.
import { GeminiGenerateContent, supportedModels, type Endpoint } from '@mozaik-ai/core';

type Mapper = Endpoint['endpointMapper'];
type Part = { functionCall?: { id?: string; name: string }; thoughtSignature?: string };

export function keepThoughtSignatures(base: Mapper): Mapper {
  const signatures = new Map<string, string>();
  let seq = 0;
  return {
    toResponse(response: any) {
      const parts: Part[] = response?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (!part.functionCall) continue;
        part.functionCall.id ||= `gc_${++seq}`;
        if (part.thoughtSignature) signatures.set(part.functionCall.id, part.thoughtSignature);
      }
      return base.toResponse(response);
    },
    toRequest(input) {
      const request = base.toRequest(input);
      for (const content of request.contents as { parts: Part[] }[]) {
        for (const part of content.parts) {
          const signature = part.functionCall?.id && signatures.get(part.functionCall.id);
          if (signature) part.thoughtSignature = signature;
        }
      }
      return request;
    },
  };
}

export type Model = (typeof supportedModels)[number];

/** Mozaik's models, with every Gemini model on one signature-keeping endpoint. */
export function models(): Model[] {
  const gemini = new GeminiGenerateContent(keepThoughtSignatures(new GeminiGenerateContent().endpointMapper));
  return supportedModels.map((m) => (m.specification.provider === 'google' ? { ...m, endpoint: gemini } : m));
}
