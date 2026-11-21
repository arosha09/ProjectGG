import { timingSafeEqual } from 'node:crypto';
import nodemailer from 'npm:nodemailer@8.0.8';

const sender = 'project.gg.mail@gmail.com';
const secret = Deno.env.get('VERIFICATION_MAIL_SECRET');
const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
if (!secret || !gmailPassword) throw new Error('Missing verification mail configuration');

const encoder = new TextEncoder();
const expectedAuth = encoder.encode(`Bearer ${secret}`);
const mail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: sender, pass: gmailPassword },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 8000,
});

Deno.serve(async (request) => {
  const auth = encoder.encode(request.headers.get('Authorization') ?? '');
  if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) {
    return new Response(null, { status: 401 });
  }
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.to !== 'string' || !/^[^\s<>,;@]+@[^\s<>,;@]+$/.test(body.to) ||
      typeof body.html !== 'string' || !body.html || body.html.length > 20000) {
    return new Response(null, { status: 400 });
  }

  try {
    await mail.sendMail({
      from: { name: 'ProjectGG', address: sender },
      to: { name: '', address: body.to },
      subject: 'Verify your email — ProjectGG',
      html: body.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Gmail SMTP delivery failed', (error as { code?: string }).code ?? 'UNKNOWN');
    return new Response(null, { status: 502 });
  }
});
