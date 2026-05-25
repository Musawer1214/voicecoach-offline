import { VoiceCoachApi } from "../shared/types";

declare global {
  interface Window {
    voiceCoach: VoiceCoachApi;
  }
}
