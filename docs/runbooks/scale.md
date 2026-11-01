# HealthSense BS191 scale (LeFu V3)

The scale connects over Bluetooth. Pulse keeps the weigh-in in `logged_entries` (source `pulse`) through `logEntry`
and writes the same weight and body fat to on-device **Health Connect** as Pulse-tagged records. Google Fit and other
apps with Health Connect access can then read them. There is no Google account and no server; Health Connect is the
only place the weigh-in leaves the app.

## Before testing

- Install the development build (`pnpm android` or `npx eas-cli@latest build --profile development`); Expo Go has no
  `react-native-ble-plx`.
- Allow **Nearby devices** when Pulse asks. Android 12+ needs `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; older Android
  needs location services for a BLE scan.
- Set height and sex in **Settings › Profile**. Body composition needs both; without a height the screen shows weight
  only and says why.
- Open **Settings › Scale** and set **Athlete mode** only if the owner trains like an athlete. It defaults off and is
  stored as `pulse.lefu.athlete`; Pulse never infers it.

## What a connection does

1. Scan (15 s) for a name matching `BS191`, `HealthSense` or `Health Scale`, or manufacturer/service data whose
   11-byte type string starts `CF`/`CE`/`CA`/`CB`/`CC`. The decoded type string is logged, not health data.
2. Connect to `FFF0`, discover services, subscribe to `FFF4`, read battery `2A19` when present.
3. Write the `FD 37` profile to `FFF1` (athlete `0x02`, male `0x01`, age, height, XOR), wait 350 ms.
4. Write the `F1` clock (year big-endian, no XOR), wait 350 ms. The `F1 00` ACK is optional; history is requested at
   the 350 ms mark either way.
5. Write `F2 00`; each 18-byte history frame is saved at its own timestamp. On the `F2 00` end marker Pulse sends
   `F2 01` only when at least one stored frame arrived.
6. Live frames fill the screen. A settled frame (V3 status `0x00` body, `0x01` weight-only) shows **Save to Pulse**;
   the person taps it. Status `0x02+` is still settling.

## Phone checks

- **Scan and connect**: open `/scale` from the Health hub's Scale card or Settings › Scale. The BS191 appears once; the
  row shows its type string and signal. Connect succeeds, then **Connected** and the battery (if exposed).
- **Barefoot weigh-in**: step on with bare feet. Weight and impedance show, then the composition grid; **Save to Pulse**
  writes weight and body fat. Check Journal/Log for the entry.
- **Socks weigh-in**: step on with socks. The scale sends a weight-only frame; Save writes weight only, and the screen
  says so.
- **History**: weigh in while Pulse is closed, then open the scale. The stored frame is saved at its timestamp; the
  History card counts received/saved. `F2 01` clears the scale only after the end marker.
- **Health Connect**: on the first Save, allow the write permission. Open Health Connect (or Google Fit with Health
  Connect access) and check that Weight and Body Fat exist with Pulse as the source and the weigh-in's time. A socks
  weigh-in writes Weight only. History backfills write at the scale's timestamps. Deny the permission once and check
  that the weigh-in is still saved locally and the Scale screen offers **Allow Health Connect writes**.
- **Reconnect**: leave and reopen the screen, or tap Connect on the remembered row. A dropped link goes back to Not
  connected with the reason; it never reconnects on its own.
- **Heart rate**: open Settings › Live heart rate and make sure the band still scans, connects and shows bpm. The scale
  has its own controller, provider and storage key; it must not touch the band's link.

## Troubleshooting

Watch the JS log on the phone:

```sh
adb logcat -s ReactNativeJS | grep -E 'PulseScale|\[scale\]'
```

- `seen <name> … type: null`: the advertisement carried no parseable type string. The name fallback (`BS191` →
  V3 CF Direct) still connects. If the type string is present but different, read it against
  `healthu-rea/reports/11-device-support.md`; an unexpected marker/status is logged as length + marker + status, never
  the weight.
- `profile incomplete`: height or age is missing in the profile. Weight still works; composition stays off.
- `history end 0`: the scale had no stored weigh-ins, or the history request never reached it. Check the `request
  history` line.
- `clock ack` absent: expected on some units; Pulse does not wait for it.
- `connect failed` / `notAScale`: the device did not expose `FFF0/FFF1/FFF4`, or Android refused the link. Check the
  Nearby devices permission and that the scale is awake.
- `Health Connect write failed`: check that Health Connect is installed/enabled and that Pulse has the Weight and Body
  Fat **write** permissions (the Scale screen's **Allow Health Connect writes**). **Retry Health Connect** re-runs the
  waiting records; a deterministic client record id keeps retries from duplicating them.
- A wrong weight unit: Pulse always sends unit `00` (kg), so the scale should report kg. If a unit byte other than 0
  arrives, the frame is converted to kg before saving.

Do not log weight, impedance or a stored frame's data. The log lines carry only the device name, type string, frame
markers/status and counts.
