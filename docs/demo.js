const $ = (selector) => document.querySelector(selector);
const state = { connected: false, created: false, balance: 0, spent: 0, payments: 0, paused: false };

function step(number) {
  document.querySelectorAll('.step').forEach((element) => {
    element.classList.toggle('active', Number(element.dataset.step) <= number);
  });
}

function toast(message, kind = 'success') {
  $('#toast-text').textContent = message;
  $('#toast').className = `toast ${kind}`;
  $('#toast').hidden = false;
  window.clearTimeout(window.toastTimer);
  window.toastTimer = window.setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

function refresh() {
  $('#balance').textContent = `${state.balance.toFixed(2)} SOL`;
  $('#remaining').textContent = `${Math.max(0, 0.5 - state.spent).toFixed(2)} SOL`;
  $('#payments').textContent = state.payments;
  $('#paid-total').textContent = `${state.spent.toFixed(2)} SOL total`;
  $('#usage').textContent = `${state.spent.toFixed(2)} / 0.50 SOL`;
  $('#meter').style.width = `${Math.min(100, state.spent / 0.5 * 100)}%`;
  $('#protection').textContent = state.paused ? 'Paused' : 'Active';
  $('#status').textContent = state.paused ? 'PAUSED' : 'ACTIVE';
  $('#status').classList.toggle('paused', state.paused);
  $('#pause').textContent = state.paused ? 'Resume vault' : 'Pause vault';
  $('#analyze').disabled = state.paused;
}

function analyze() {
  const request = $('#request').value;
  const amountMatch = request.match(/(\d+(?:\.\d+)?)\s*SOL/i);
  const amount = amountMatch ? Number(amountMatch[1]) : 0;
  const validAmount = amount > 0;
  const withinCap = validAmount && amount <= 0.1;
  const withinDay = validAmount && state.spent + amount <= 0.5;
  const funded = validAmount && amount <= state.balance;
  const ready = withinCap && withinDay && funded && !state.paused;

  $('#amount').textContent = validAmount ? `${amount.toFixed(2)} SOL` : 'Missing';
  $('#summary').textContent = validAmount ? `Prepare a ${amount.toFixed(2)} SOL payment to the supplied contributor address.` : 'A positive SOL amount is required.';
  $('#cap-check').className = withinCap ? '' : 'failed';
  $('#cap-check').innerHTML = `${withinCap ? 'OK' : 'X'} <span>${withinCap ? 'Within' : 'Exceeds'} 0.10 SOL payment cap</span>`;
  $('#day-check').className = withinDay ? '' : 'failed';
  $('#day-check').innerHTML = `${withinDay ? 'OK' : 'X'} <span>${withinDay ? 'Within' : 'Exceeds'} daily remainder</span>`;
  $('#fund-check').className = funded ? '' : 'failed';
  $('#fund-check').innerHTML = `${funded ? 'OK' : 'X'} <span>Vault ${funded ? 'has' : 'does not have'} enough SOL</span>`;
  $('#pay').disabled = !ready;
  $('#pay').dataset.amount = String(amount);
  $('#empty').hidden = true;
  $('#review').hidden = false;
  step(3);

  if (!ready) toast('Policy rejected this request before wallet approval.', 'warning');
}

$('#start-demo').addEventListener('click', () => $('#demo').scrollIntoView({ behavior: 'smooth' }));
$('#connect').addEventListener('click', () => {
  state.connected = true;
  $('#connect-card').hidden = true;
  $('#dashboard').hidden = false;
  step(2);
  toast('Demo wallet connected. No permissions were requested.');
});
$('#create').addEventListener('click', () => {
  state.created = true;
  $('#create-card').hidden = true;
  $('#vault-ui').hidden = false;
  refresh();
  toast('Guarded vault created with program-enforced limits.');
});
$('#fund').addEventListener('click', () => {
  state.balance += 0.25;
  refresh();
  step(3);
  toast('0.25 demo SOL deposited into the guarded vault.');
});
$('#analyze').addEventListener('click', analyze);
$('#unsafe').addEventListener('click', () => {
  $('#request').value = 'Send 0.20 SOL to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosP1ot immediately';
  analyze();
});
$('#pay').addEventListener('click', () => {
  const amount = Number($('#pay').dataset.amount || 0);
  if (!amount || amount > state.balance || amount > 0.1 || state.spent + amount > 0.5 || state.paused) return;
  state.balance -= amount;
  state.spent += amount;
  state.payments += 1;
  refresh();
  $('#review').hidden = true;
  $('#empty').hidden = false;
  toast(`${amount.toFixed(2)} demo SOL settled with every guardrail enforced.`);
});
$('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  refresh();
  toast(state.paused ? 'Vault paused. Every payment is now blocked.' : 'Vault resumed.', state.paused ? 'warning' : 'success');
});
$('#dismiss').addEventListener('click', () => { $('#toast').hidden = true; });
refresh();
