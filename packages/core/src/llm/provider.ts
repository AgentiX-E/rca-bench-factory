/**
 * Provider-agnostic LLM abstraction.
 *
 * Rule generation must never be locked to a single model vendor. A provider is
 * any object that can turn a prompt into raw completion text; concrete DeepSeek,
 * OpenAI or offline adapters implement this interface behind a factory.
 */
export interface LlmProvider {
  generate(prompt: string): Promise<string>;
}
