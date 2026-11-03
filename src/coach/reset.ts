// "Delete everything" must not leave the AI coach behind: the chats live in the Store (clearAll deliberately keeps
// them), and the provider, consent, notes and key live in AsyncStorage and SecureStore. This module takes the Store so
// both databases (the person's and the sample one) can be wiped, without importing the app state.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Store } from "@/data/store";
import { API_KEY, SETUP_KEY } from "./keys";

/** Removes the chats from `store`, the API key and the whole setup (provider, model, consent, notes). Never throws. */
export async function resetCoachState(store: Store): Promise<void> {
  await store.deleteCoachChats().catch(() => {});
  await SecureStore.deleteItemAsync(API_KEY).catch(() => {});
  await AsyncStorage.removeItem(SETUP_KEY).catch(() => {});
}
