import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly fromName: string;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
    });
    this.fromName = this.config.get<string>('SMTP_FROM_NAME', 'ProjectGG');
    this.fromEmail = this.config.get<string>(
      'SMTP_FROM_EMAIL',
      'noreply@projectgg.app',
    );
    this.frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
  }

  async sendVerificationEmail(
    to: string,
    code: string,
    userName: string,
  ): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email — ProjectGG</title>
</head>
<body style="margin:0;padding:0;background:#050a18;color:#e0f0ea;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050a18;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- top neon bar -->
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,#00e676,transparent);opacity:0.4;"></td>
          </tr>

          <!-- main card -->
          <tr>
            <td style="background:linear-gradient(180deg,rgba(4,10,22,0.97),rgba(6,15,30,0.9));border:1px solid rgba(255,255,255,0.06);border-top:none;border-radius:0 0 10px 10px;padding:40px 36px;">

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- logo -->
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <span style="font-size:22px;font-weight:900;letter-spacing:3px;color:#00e676;text-shadow:0 0 30px rgba(0,230,118,0.2);">PROJECT GG</span>
                  </td>
                </tr>

                <!-- heading -->
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <h1 style="margin:0;font-size:16px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;">
                      Email Verification
                    </h1>
                  </td>
                </tr>

                <!-- divider -->
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <span style="display:inline-block;width:40px;height:1px;background:#00e676;opacity:0.3;"></span>
                  </td>
                </tr>

                <!-- body -->
                <tr>
                  <td style="padding-bottom:20px;font-size:14px;line-height:1.6;color:rgba(200,230,220,0.7);text-align:center;">
                    Welcome, <strong style="color:#00e676;">${this.escapeHtml(userName)}</strong>.<br/>
                    Use the code below to verify your email. It expires in <strong style="color:#00e676;">10 minutes</strong>.
                  </td>
                </tr>

                <!-- code box -->
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,230,118,0.25);border-radius:8px;padding:16px 32px;">
                          <span style="font-family:'SF Mono','Fira Code','Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#00e676;text-shadow:0 0 20px rgba(0,230,118,0.25);">${code}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- hint -->
                <tr>
                  <td align="center" style="padding-bottom:4px;font-size:12px;color:rgba(200,230,220,0.45);">
                    Enter this code in Settings → Email Verification on ProjectGG.
                  </td>
                </tr>

                <!-- footer -->
                <tr>
                  <td style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.04);font-size:11px;line-height:1.5;color:rgba(200,230,220,0.25);text-align:center;">
                    If you didn't create an account on ProjectGG, you can ignore this email.
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- bottom neon bar -->
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,#00e676,transparent);opacity:0.4;"></td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to,
      subject: 'Verify your email — ProjectGG',
      html,
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
