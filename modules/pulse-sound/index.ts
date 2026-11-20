// The gym's sound effects (android/…/PulseSoundModule.kt, docs/gym.md "Sound and touch"). Without the native module
// (tests, an older build) every call does nothing.
import { requireOptionalNativeModule } from "expo";

export type SoundName = "tick" | "untick" | "add" | "done" | "record" | "finish";

type Native = { load(): void; play(name: SoundName, volume: number): void; release(): void };
const native = requireOptionalNativeModule<Native>("PulseSound");

const quiet = (fn: () => void) => {
  try {
    fn();
  } catch {
    // A sound that cannot play is not worth an error.
  }
};

/** Decodes the clips into one small pool. Call when a workout page opens; `releaseSounds` when it closes. */
export const loadSounds = () => quiet(() => native?.load());
/** Plays one clip at `volume` (0 to 1). Silent before `loadSounds`, and on a phone set to silent or vibrate. */
export const playSound = (name: SoundName, volume = 0.7) => quiet(() => native?.play(name, volume));
export const releaseSounds = () => quiet(() => native?.release());
