// relay.js — isolated world. Forwards MAIN-world probe messages to the
// service worker. Verifies the message came from the page itself.

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'bbg-fp-main' || !data.hits) return;
  chrome.runtime.sendMessage({ type: 'bbg-fp', hits: data.hits }).catch(() => {
    /* service worker may be asleep; hits are best-effort */
  });
});
