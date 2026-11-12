// Online food orders from SMS (Pulse-only, Android): the confirmation messages the delivery apps send. The parser is
// local and deterministic; the message body is read once and never stored, only the merchant, day and a dedupe key.
import { localDay } from "@/lib/time";

/** One inbox message, as the native reader hands it over. `date` is milliseconds since the epoch. */
export type SmsMessage = { id: string; address: string; body: string; date: number };

/** One confirmed food order. `key` merges the two or three messages one order can send. */
export type FoodOrder = { id: string; key: string; day: string; ts: number; merchant: string; source: string };

/** The Indian delivery apps and their restaurant brands; a known name is the fallback when the body has no "from X". */
const BRANDS = [
  "Swiggy", "Zomato", "Toing", "EatSure", "EatFit", "Faasos", "Behrouz", "Ovenstory", "Box8", "Freshto",
  "Domino's", "Pizza Hut", "KFC", "Burger King", "McDonald's", "Subway", "Starbucks", "Wow! Momo", "Chai Point",
  "Blinkit", "Zepto", "Instamart", "BigBasket", "Licious", "Biryani Blues", "Paradise", "Haldiram's", "Bikanervala",
  "Third Wave Coffee", "Blue Tokai", "Natural Ice Cream", "Baskin Robbins", "Dunkin'", "RollsKing", "Rebel Foods",
];

/** A message that may be an order, as opposed to a delivery update, a promo or an OTP. */
const ORDER_PHRASES = [
  /has received your\b.{0,40}?\border\b/i,
  /\border\b.{0,30}?\b(?:has been|was|is)\s+(?:placed|confirmed|received|successful)\b/i,
  /\border\s+(?:has been\s+)?placed\b/i,
  /\b(?:your|the)\s+order\s+(?:from|at)\b/i,
  /\b(?:thanks|thank you)\s+for\s+(?:your\s+)?order(?:ing)?\b/i,
  /\bwe(?:'ve| have)\s+received\s+your\s+order\b/i,
  /\bsuccessfully\s+(?:placed|ordered)\b/i,
];

/** Never a new order: an OTP, a cancellation, a delivery status or an advert. */
const NOT_ORDER = [
  /\b(?:otp|one[- ]time password|verification code|password|pin)\b/i,
  /\b(?:cancelled|canceled|refund(?:ed)?|failed|declined|payment failed)\b/i,
  /\b(?:out for delivery|delivered|on the way|arriving|picked up|dispatched)\b/i,
  /\b(?:offer|coupon|discount|% off|save \d)\b/i,
];

const clean = (s: string) => s
  .replace(/\s+/g, " ")
  .replace(/^(?:hi|hello|hey)[,!:\s]+/i, "")
  .replace(/^[\s"'“”]+|[\s"'“”.,;:!]+$/g, "")
  .trim();

/** "Boom Pizza - Woodfired Pizzeria has received your Toing order" -> "Boom Pizza - Woodfired Pizzeria". */
function merchantOf(body: string, address: string): string | null {
  const patterns = [
    /^(.{2,80}?)\s+has received your\b.{0,40}?\border\b/i,
    /\b(?:your|the)\s+order\s+from\s+(.{2,80}?)(?=\s+(?:has|is|was|will)\b|[.,!]|$)/i,
    /\border\s+placed(?:\s+\w+){0,2}\s+(?:at|from)\s+(.{2,80}?)(?=\s+(?:has|is|was|will)\b|[.,!]|$)/i,
    /\border\s+(?:at|from)\s+(.{2,80}?)(?=\s+(?:has|is|was|will)\b|[.,!]|$)/i,
    /\b(?:thanks|thank you)\s+for\s+(?:your\s+)?order(?:ing)?\s+from\s+(.{2,80}?)(?=[.,!]|$)/i,
    /\b(?:your|the)\s+(.{2,80}?)\s+order\b.{0,30}?\b(?:placed|confirmed|received)\b/i,
  ];
  for (const pattern of patterns) {
    const found = body.match(pattern)?.[1];
    const merchant = found ? clean(found) : "";
    if (merchant.length >= 2 && !/^(?:your|the|an?|order|online|food)$/i.test(merchant)) return merchant.slice(0, 60);
  }
  const lowerBody = body.toLowerCase();
  const lowerAddress = address.toLowerCase();
  return BRANDS.find((brand) => lowerBody.includes(brand.toLowerCase()) || lowerAddress.includes(brand.toLowerCase())) ?? null;
}

/** The link or order number an app repeats in its confirmation texts; null when the text carries neither. */
function keyOf(body: string, merchant: string, day: string, ts: number): string {
  const link = body.match(/\border\/([a-z0-9-]{8,})/i)?.[1];
  if (link) return `link:${link.toLowerCase()}`;
  const number = body.match(/\b(?:order|ord)\s*(?:id|no|number|#)\s*[:#-]?\s*([a-z0-9-]{5,})/i)?.[1];
  if (number) return `id:${number.toLowerCase()}`;
  // A confirmation and its "order confirmed" follow-up land within the hour, not two hours apart.
  return `${merchant.toLowerCase()}|${day}|${Math.floor(ts / 3600)}`;
}

/** One message as an order, or null. `timeZone` turns the message's instant into the local civil day. */
export function parseFoodOrder(message: SmsMessage, timeZone: string): FoodOrder | null {
  if (!message.body || !message.id || !(message.date > 0)) return null;
  if (NOT_ORDER.some((pattern) => pattern.test(message.body))) return null;
  if (!ORDER_PHRASES.some((pattern) => pattern.test(message.body))) return null;
  const merchant = merchantOf(message.body, message.address);
  if (!merchant) return null;
  const ts = Math.floor(message.date / 1000);
  const day = localDay(ts, timeZone);
  return { id: `sms:${message.id}`, key: keyOf(message.body, merchant, day, ts), day, ts, merchant, source: message.address.slice(0, 80) };
}

/** Every distinct order in a batch, newest message first for an order that sent several. */
export function ordersFromMessages(messages: readonly SmsMessage[], timeZone: string): FoodOrder[] {
  const found = new Map<string, FoodOrder>();
  for (const message of messages) {
    const order = parseFoodOrder(message, timeZone);
    if (order && !found.has(order.key)) found.set(order.key, order);
  }
  return [...found.values()];
}
