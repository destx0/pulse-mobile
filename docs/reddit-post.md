# Reddit post: Pulse Mobile 0.3.0

## Title

turns out it was legal (i think), so i made it an android app

Other options:
- nobody sent me a legal notice, so i put the whole thing on your phone now
- update to "is it legal to create an app like this": it's an apk now

## Images (in this order)

1. `docs/screenshots/framed/01-home.png`
2. `docs/screenshots/framed/02-sleep.png`
3. `docs/screenshots/framed/03-recovery.png`
4. `docs/screenshots/framed/04-strain.png`
5. `docs/screenshots/framed/05-pulse-age.png`
6. `docs/screenshots/framed/06-stress-monitor.png`
7. `docs/screenshots/framed/07-trends.png`
8. `docs/screenshots/framed/08-coach.png`

## Body

hey everyone, so some of you might remember my last post "is it legal to create an app like this". that was pulse, the self hosted web app that takes your fitbit data and gives you recovery, strain and sleep scores. it got way more love than i expected, so thank you for all the stars, feedback and the "just make it an app bro" comments

so i made it an app :)

**pulse mobile** is an android app (react native + expo) and the main difference is that there is no server at all. it reads your fitbit data from health connect, scores everything on the phone and keeps it there. no account, no login, no google sign in, nothing goes anywhere. it asks for read permissions for your fitbit data, and writes only your scale weigh-ins (weight and body fat) back to health connect

what you get:
- sleep, recovery and strain every morning, with a strain target for the day
- pulse age (how old your body is acting vs your real age) and pace of aging
- stress monitor and energy bank through the day
- health monitor, journal, trends, reports and your own dashboard
- sleep goal that can set itself automatically from the nights before your best recovery days
- an optional ai coach, bring your own gemini key and it answers from your own numbers

0.3.0 is out today and it has a completely rewritten scoring engine, so the numbers should feel a lot more sensible than the first version

few things to know before you install:
- android only for now, and it's an apk so you have to allow "install unknown apps"
- your fitbit app needs to be syncing to health connect, first open imports the last 180 days
- free for personal use
- obviously not medical advice, it's just math on your own data

links:
- android app: https://github.com/destx0/pulse-mobile
- apk: https://github.com/destx0/pulse-mobile/releases/latest (grab the arm64 one, it works on pretty much every phone)
- the web version (still there if you want it on a server): https://github.com/destx0/pulse

if you try it please tell me what's off, which score feels wrong, what's missing, anything. issues on github are the best place but comments here work too. and a star on the repo helps a lot 🙏
