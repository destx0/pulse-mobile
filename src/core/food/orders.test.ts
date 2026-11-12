import { describe, expect, it } from "vitest";
import { ordersFromMessages, parseFoodOrder, type SmsMessage } from "./orders";

const sms = (over: Partial<SmsMessage> = {}): SmsMessage => ({
  id: "1",
  address: "SWGTNG",
  body: "Hi, Boom Pizza - Woodfired Pizzeria has received your Toing order. https://r.toingit.com/swgtng/order/efa654dc9364ddb8d4b64d00c5uoms - SWGTNG",
  date: Date.parse("2026-11-02T13:30:00Z"),
  ...over,
});

describe("food orders from SMS", () => {
  it("reads the Toing confirmation and the restaurant from it", () => {
    expect(parseFoodOrder(sms(), "UTC")).toMatchObject({
      key: "link:efa654dc9364ddb8d4b64d00c5uoms",
      day: "2026-11-02",
      merchant: "Boom Pizza - Woodfired Pizzeria",
      source: "SWGTNG",
    });
  });

  it("reads Swiggy, Zomato and a named brand without a link", () => {
    const swiggy = parseFoodOrder(sms({ id: "2", address: "SWIGGY", body: "Your order from Biryani Blues has been placed. Order ID: 123456" }), "UTC");
    expect(swiggy).toMatchObject({ merchant: "Biryani Blues", key: "id:123456" });
    const zomato = parseFoodOrder(sms({ id: "3", address: "ZOMATO", body: "Your order from EatFit has been confirmed. Thanks for ordering!" }), "UTC");
    expect(zomato?.merchant).toBe("EatFit");
    const dominos = parseFoodOrder(sms({ id: "4", address: "DOMINOS", body: "Order placed successfully at Domino's Pizza. Your food is being prepared." }), "UTC");
    expect(dominos?.merchant).toBe("Domino's Pizza");
  });

  it("ignores OTPs, delivery updates, cancellations and adverts", () => {
    expect(parseFoodOrder(sms({ body: "123456 is your Swiggy OTP. Do not share it." }), "UTC")).toBeNull();
    expect(parseFoodOrder(sms({ body: "Your Swiggy order has been delivered. Enjoy!" }), "UTC")).toBeNull();
    expect(parseFoodOrder(sms({ body: "Your Zomato order was cancelled. Refund initiated." }), "UTC")).toBeNull();
    expect(parseFoodOrder(sms({ body: "50% off! Order now from Swiggy and save." }), "UTC")).toBeNull();
    expect(parseFoodOrder(sms({ body: "Payment of Rs 240 received for your order." }), "UTC")).toBeNull();
  });

  it("keeps one order from the confirmation and the follow-up, and keeps two real orders apart", () => {
    const one = sms({ id: "10", body: "Your order from Faasos has been placed. Order ID: 98765" });
    const followUp = sms({ id: "11", body: "Your order from Faasos has been confirmed. Order ID: 98765", date: one.date + 60_000 });
    const another = sms({ id: "12", body: "Your order from Faasos has been placed. Order ID: 98766", date: one.date + 7_200_000 });
    expect(ordersFromMessages([one, followUp, another], "UTC").map((o) => o.key)).toEqual(["id:98765", "id:98766"]);
  });

  it("uses the profile time zone for the day", () => {
    const order = parseFoodOrder(sms({ date: Date.parse("2026-11-02T20:00:00Z") }), "Asia/Kolkata");
    expect(order?.day).toBe("2026-11-03");
  });
});
