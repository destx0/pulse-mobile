// Pulse's SMS inbox reader (android/…/PulseSmsModule.kt). Without the native module (tests, web) it returns nothing.
import { requireOptionalNativeModule } from "expo";

export type SmsMessage = { id: string; address: string; body: string; date: number };

type Native = { readInbox(sinceMs: number, limit: number): Promise<SmsMessage[]> };
const native = requireOptionalNativeModule<Native>("PulseSms");

/** Inbox messages at or after `sinceMs`, newest first. Empty when the permission or the module is missing. */
export async function readInbox(sinceMs: number, limit = 3000): Promise<SmsMessage[]> {
  try {
    return (await native?.readInbox(sinceMs, limit)) ?? [];
  } catch {
    return [];
  }
}
