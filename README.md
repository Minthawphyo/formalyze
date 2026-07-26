![Formalyze](banner.png)

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a73e8)
![OpenAI](https://img.shields.io/badge/Powered%20by-OpenAI-412991?logo=openai&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-4caf50)

Formalyze is a Chrome extension that adds a Formalize button to Gmail and Outlook on the web. It takes whatever you just typed and rewrites it into formal, professional English using the OpenAI API. I built it because writing something formal is genuinely harder than writing what you actually mean, especially if you grew up texting instead of writing letters.

## What it does

When you click Formalize, it grabs your current draft and sends it to OpenAI, which rewrites the tone while keeping your meaning and facts intact. The new version is typed back into the compose box instead of just appearing, so it feels less like a black box swap and more like watching the email get polished in real time.

If you decide you liked your original wording better, Undo brings it right back. And if you're curious what actually changed, the Changes button opens a small panel that highlights every word that was added or removed, which doubles as a small lesson in what formal phrasing actually looks like.

You can also set a default tone (formal or very formal) from the extension's settings popup. Your OpenAI key is stored locally in the browser and never hardcoded anywhere or sent anywhere except directly to OpenAI.

## How it works

The content script watches the page for open compose windows, in both Gmail and Outlook on the web. It finds them by looking for the compose body's accessibility label rather than any provider's internal class names, since those are obfuscated and change often. Once it finds a compose window, it draws a small floating control panel on top of it rather than trying to inject into the provider's own toolbar, which turned out to be too fragile to target reliably.

Clicking Formalize sends the draft text to the background service worker, which calls OpenAI's chat completions API with a prompt telling it to rewrite the email formally while preserving the original meaning and, as much as possible, the original line breaks. The rewritten text replaces the draft, and the original is kept in memory so Undo and the diff view both have something to compare against.

## Setting it up

Open `chrome://extensions` and turn on Developer mode in the top right. Click Load unpacked and select this folder. Click the Formalyze icon in your toolbar, paste in an OpenAI API key (you can get one at platform.openai.com), pick a default tone, and save. Then open Gmail or Outlook on the web, start writing something casual, and click Formalize.

## Things worth knowing before you demo it

Both Gmail's and Outlook's page structure are obfuscated and change often, so the extension deliberately avoids depending on either beyond the compose body's accessibility label. The controls are positioned using the compose box's live position on screen instead of being injected into either provider's toolbar, which is why they float above the page and follow it as you scroll or resize.

The API key lives in the browser's local storage and requests go straight from your browser to OpenAI. That's fine for a personal project or a demo, but a version meant for other people to use should route requests through a backend of your own so your key never ships to end users.

Text is replaced using a deprecated browser API (`execCommand`), which is still the most reliable way to update either provider's editable content without breaking its internal undo stack. The diff view is computed with a simple word level comparison, which works well at email length but wasn't built for huge documents.


