import { CoachingSuggestion, TextSuggestionDocument } from "../../shared/types";

const ANALYZER_VERSION = "text-suggestions-v1";
const FILLERS = ["um", "uh", "like", "you know", "actually", "basically", "literally", "kind of", "sort of"];
const WEAK_OPENINGS = ["so", "basically", "actually", "i think", "maybe"];
const LONG_SENTENCE_WORDS = 28;

export function buildTextSuggestions(sessionId: string, text: string): TextSuggestionDocument {
  const normalized = normalizeText(text);
  const words = normalized.length === 0 ? [] : normalized.split(/\s+/);
  const sentences = splitSentences(text);
  const fillerMatches = countFillerWords(normalized);
  const repeatedPhrases = findRepeatedPhrases(words);
  const longSentences = sentences.filter((sentence) => countWords(sentence) >= LONG_SENTENCE_WORDS);
  const suggestions: CoachingSuggestion[] = [];

  if (words.length === 0) {
    suggestions.push({
      id: "text-empty",
      category: "transcript",
      severity: "info",
      title: "Add transcript text",
      detail: "Paste or type a transcript to run local grammar and clarity suggestions."
    });
  }

  if (fillerMatches > 0) {
    suggestions.push({
      id: "text-fillers",
      category: "transcript",
      severity: "info",
      title: "Reduce filler words",
      detail: `Found ${fillerMatches} filler word${fillerMatches === 1 ? "" : "s"} or phrases. Practice pausing silently instead.`
    });
  }

  if (repeatedPhrases.length > 0) {
    suggestions.push({
      id: "text-repetition",
      category: "transcript",
      severity: "info",
      title: "Watch repeated phrases",
      detail: `Repeated phrase: "${repeatedPhrases[0].phrase}". Repetition can make delivery sound less prepared.`
    });
  }

  if (longSentences.length > 0) {
    suggestions.push({
      id: "text-long-sentences",
      category: "transcript",
      severity: "warning",
      title: "Break long sentences",
      detail: `${longSentences.length} sentence${longSentences.length === 1 ? "" : "s"} ran longer than ${LONG_SENTENCE_WORDS} words. Shorter sentences are easier to speak clearly.`
    });
  }

  const firstWords = words.slice(0, 2).join(" ");
  const firstWord = words[0] ?? "";
  if (WEAK_OPENINGS.includes(firstWords) || WEAK_OPENINGS.includes(firstWord)) {
    suggestions.push({
      id: "text-opening",
      category: "transcript",
      severity: "info",
      title: "Strengthen the opening",
      detail: "The transcript starts with a soft opening. Try beginning with the main point first."
    });
  }

  if (suggestions.length === 0 && words.length > 0) {
    suggestions.push({
      id: "text-clear",
      category: "transcript",
      severity: "success",
      title: "Transcript looks concise",
      detail: "No obvious filler, repetition, or long-sentence issue was found by the local rule checker."
    });
  }

  return {
    schemaVersion: 1,
    analyzerVersion: ANALYZER_VERSION,
    sessionId,
    updatedAt: new Date().toISOString(),
    metrics: {
      wordCount: words.length,
      sentenceCount: sentences.length,
      fillerCount: fillerMatches,
      repeatedPhraseCount: repeatedPhrases.length,
      longSentenceCount: longSentences.length
    },
    suggestions
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countWords(text: string): number {
  const normalized = normalizeText(text);
  return normalized.length === 0 ? 0 : normalized.split(/\s+/).length;
}

function countFillerWords(normalized: string): number {
  return FILLERS.reduce((total, filler) => {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalized.match(new RegExp(`\\b${escaped}\\b`, "g"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function findRepeatedPhrases(words: string[]): Array<{ phrase: string; count: number }> {
  const counts = new Map<string, number>();

  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      if (phrase.length < 5) {
        continue;
      }
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count);
}
