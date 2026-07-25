const apiKeyInput = document.getElementById('apiKey');
const toneSelect = document.getElementById('tone');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

chrome.storage.local.get(['openaiApiKey', 'tone'], ({ openaiApiKey, tone }) => {
  if (openaiApiKey) apiKeyInput.value = openaiApiKey;
  if (tone) toneSelect.value = tone;
});

saveBtn.addEventListener('click', () => {
  const openaiApiKey = apiKeyInput.value.trim();
  const tone = toneSelect.value;

  if (!openaiApiKey.startsWith('sk-')) {
    showStatus("That doesn't look like a valid key.", false);
    return;
  }

  chrome.storage.local.set({ openaiApiKey, tone }, () => {
    showStatus('Saved.', true);
  });
});

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'ok' : 'err';
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 2500);
}
