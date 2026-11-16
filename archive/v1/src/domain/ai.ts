export type AiExplanation = {
  status: 'GENERATED'|'FALLBACK';
  provider: 'deepseek'; model: string; promptVersion: string; generatedAt: string;
  conclusion: string | null;
  overview: string;
  items: { itemId: string; status: string; explanation: string; nextStep: string; sourceIds: string[] }[];
  message?: string;
};
