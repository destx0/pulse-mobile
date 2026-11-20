// Sound and touch on the workout page (docs/gym.md "Sound and touch"): each moment of a workout has its own clip and its
// own buzz, so a set ticked, an exercise finished and a new record feel different without looking. The clips live in
// the pulse-sound module and are decoded only while a workout page is open. Sounds can be turned off from the page's
// menu (the buzz stays, as the rest of the app's haptics do); a phone on silent or vibrate plays none.
import { useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { loadSounds, playSound, releaseSounds, type SoundName } from "../../../modules/pulse-sound";

const KEY = "pulse.gym.sounds";

let soundsOn = true;
let read = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

function readSetting() {
  if (read) return;
  read = true;
  void AsyncStorage.getItem(KEY)
    .then((v) => {
      if (v === "off") {
        soundsOn = false;
        emit();
      }
    })
    .catch(() => {});
}

export function setGymSounds(on: boolean) {
  soundsOn = on;
  emit();
  void AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {});
}

/** Whether the workout page plays its sounds, for the menu's switch. */
export function useGymSounds(): boolean {
  readSetting();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => soundsOn,
  );
}

// Pages holding the clips, and the release waiting for the last of them to let go. The release waits a moment: finishing
// a workout ends its page's hold in the same breath as the finish chord starts, and releasing the pool cuts a clip off.
let holders = 0;
let releasing: ReturnType<typeof setTimeout> | null = null;
const LINGER_MS = 2500;

/** Holds the clips in memory while a page that plays them is mounted (a workout in progress), and only then. */
export function useGymSoundPool(active: boolean) {
  useEffect(() => {
    if (!active) return;
    readSetting();
    holders++;
    if (releasing) clearTimeout(releasing);
    releasing = null;
    loadSounds();
    return () => {
      holders--;
      if (holders > 0) return;
      releasing = setTimeout(() => {
        releasing = null;
        if (holders === 0) releaseSounds();
      }, LINGER_MS);
    };
  }, [active]);
}

const ignore = () => {};
const heavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(ignore);
const medium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore);
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore);
const android = (type: Haptics.AndroidHaptics) => () => Haptics.performAndroidHapticsAsync(type).catch(ignore);

/** Buzzes in a rhythm: [delay ms, buzz] pairs from the moment of the tap. */
const pattern = (steps: [number, () => unknown][]) => {
  for (const [at, buzz] of steps) {
    if (at === 0) buzz();
    else setTimeout(buzz, at);
  }
};

const sound = (name: SoundName, volume?: number) => {
  if (soundsOn) playSound(name, volume);
};

export const gymFeel = {
  /** A set ticked: a pop and one crisp click. */
  tick: () => {
    sound("tick", 0.55);
    android(Haptics.AndroidHaptics.Confirm)();
  },
  /** A tick taken back. */
  untick: () => {
    sound("untick", 0.45);
    android(Haptics.AndroidHaptics.Toggle_Off)();
  },
  /** The last set of an exercise ticked: two bells and a double tap. */
  exerciseDone: () => {
    sound("done", 0.6);
    pattern([
      [0, medium],
      [110, medium],
    ]);
  },
  /** A set that beats every earlier one on its exercise: the arpeggio and a drum roll under the thumb. */
  record: () => {
    sound("record", 0.75);
    pattern([
      [0, heavy],
      [90, medium],
      [180, medium],
      [300, heavy],
    ]);
  },
  /** A set or an exercise added. */
  add: () => {
    sound("add", 0.5);
    light();
  },
  /** The workout saved: the rolled chord and a long, building buzz. */
  finish: () => {
    sound("finish", 0.75);
    pattern([
      [0, heavy],
      [120, light],
      [200, medium],
      [300, heavy],
    ]);
  },
  /** A tick the page refused (an empty set). No sound: the toast says why. */
  refused: () => android(Haptics.AndroidHaptics.Reject)(),
};
