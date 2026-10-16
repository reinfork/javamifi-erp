// ponytail: first-boot-only seed (entrypoint guard = sqlite exists); later JSON edits need a manual re-import/publish.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`seed: missing ${k}`); process.exit(1); } return v; };
const run = (a) => execFileSync('n8n', a, { stdio: 'inherit' });

writeFileSync('/tmp/creds.json', JSON.stringify([
  { id: 'javamifi-header-auth', name: 'javamifi-header-auth', type: 'httpHeaderAuth', data: { name: 'X-Webhook-Secret', value: need('N8N_WEBHOOK_SECRET') } },
  { id: 'javamifi-telegram', name: 'javamifi-telegram', type: 'telegramApi', data: { accessToken: need('TELEGRAM_BOT_TOKEN') } },
]));
run(['import:credentials', '--input=/tmp/creds.json']);

writeFileSync('/tmp/workflow.json',
  readFileSync('/workflows/payment-success-workflow.json', 'utf8').replace('<TELEGRAM_CHAT_ID>', need('TELEGRAM_CHAT_ID')));
run(['import:workflow', '--input=/tmp/workflow.json']);
run(['publish:workflow', '--id=javamifi-payment-success']);
