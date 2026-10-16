import 'dotenv/config.js';
import app from './app.js';
import { env, runtime } from './config.js';

if (!env.jwtSecret) { console.error('JWT_SECRET missing'); process.exit(1); }
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`backend on :${port}`);
  // ponytail: dev-only self tunnel so Midtrans can reach localhost; ceiling = random URL per boot, prod never sets the flag
  if (env.devTunnel && !runtime.publicBaseUrl) {
    import('cloudflared').then(({ Tunnel }) => {
      const tunnel = Tunnel.quick(`http://localhost:${port}`);
      tunnel.once('url', (url) => {
        runtime.publicBaseUrl = String(url).replace(/\/$/, '');
        console.log(`dev tunnel: ${runtime.publicBaseUrl} -> :${port} (X-Override-Notification active)`);
      });
      tunnel.once('exit', (code) => console.error(`dev tunnel exited (${code}), notifications fall back to dashboard URL`));
    }).catch((e) => console.error('dev tunnel failed to start:', e.message));
  }
});
