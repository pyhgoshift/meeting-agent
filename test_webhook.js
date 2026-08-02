const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwSroeYNVA5NrubKL8A2f5uFzITtBfv47SiwocZqxFPDB7x1ipwawrJusuECEsqhZD42g/exec';

const payload = {
  sequence: '260731-01',
  date: '2026-07-31',
  title: 'test_meeting',
  summary: 'This is a test summary.',
  decisions: 'Decision 1\nDecision 2',
  todos: 'Todo 1\nTodo 2'
};

fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(res => res.text().then(text => console.log('STATUS:', res.status, 'BODY:', text)))
.catch(err => console.error('ERROR:', err));
