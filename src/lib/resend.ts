import { Resend } from 'resend';

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_your_') || apiKey.includes('placeholder')) {
    return null;
  }
  return new Resend(apiKey);
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'BumpOne Support <support@bumpone.lol>';
const NOTIFY_EMAIL = process.env.SUPPORT_INBOX_EMAIL || 'support@bumpone.lol';

export interface SendReplyParams {
  to: string;
  subject: string;
  replyText: string;
  originalMessage?: string;
  originalSenderName?: string;
}

export async function sendContactReply(params: SendReplyParams): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const resend = getResendClient();
  if (!resend) {
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured',
    };
  }

  const cleanSubject = params.subject.startsWith('Re:')
    ? params.subject
    : `Re: ${params.subject} — BumpOne Support`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
      <div style="padding: 20px 0; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
        <img src="https://bumpone.lol/bumpone-logo.png" alt="BumpOne" width="28" height="28" style="vertical-align: middle; border-radius: 6px; display: inline-block;" />
        <div>
          <span style="font-size: 20px; font-weight: 800; color: #000; letter-spacing: -0.5px;">
            BumpOne<span style="color: #f59e0b;">.lol</span>
          </span>
          <span style="display: block; font-size: 12px; color: #6b7280; font-family: monospace;">Support Desk</span>
        </div>
      </div>

      <div style="padding: 24px 0; white-space: pre-wrap; font-size: 15px; color: #111827;">${escapeHtml(params.replyText)}</div>

      ${
        params.originalMessage
          ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-left: 3px solid #d1d5db; border-radius: 4px;">
          <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px;">Original Inquiry:</div>
          <div style="font-size: 13px; color: #4b5563; white-space: pre-wrap;">${escapeHtml(params.originalMessage)}</div>
        </div>
      `
          : ''
      }

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
        BumpOne.lol • Real-Time Digital Billboard & Showcase<br />
        Direct inquiries: support@bumpone.lol
      </div>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      replyTo: 'support@bumpone.lol',
      subject: cleanSubject,
      text: params.replyText,
      html: htmlContent,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch email' };
  }
}

export async function sendContactNotification(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
  messageId: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [NOTIFY_EMAIL],
      replyTo: params.email,
      subject: `[BumpOne Support] New Inquiry: ${params.subject} (from ${params.name})`,
      text: `New support ticket received:\n\nFrom: ${params.name} <${params.email}>\nSubject: ${params.subject}\nTicket ID: ${params.messageId}\n\nMessage:\n${params.message}\n\nView and reply in admin dashboard: https://bumpone.lol/admin`,
    });
  } catch (err) {
    console.warn('[Resend] Failed to send contact notification email:', err);
  }
}

export interface SendOutbidAlertParams {
  to: string;
  projectTitle: string;
  previousRank: number;
  newRank: number; // >100 indicates moved to Graveyard
  promotedTitle: string;
  promotedBidder: string;
  promotedAmountFormatted: string;
  reclaimUrl: string;
}

export async function sendOutbidAlert(params: SendOutbidAlertParams): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  const isGraveyard = params.newRank > 100;
  const isKingLost = params.previousRank === 1;

  const subject = isGraveyard
    ? `🚨 Graveyard Alert: "${params.projectTitle}" was dropped to Rank #101!`
    : isKingLost
    ? `👑 King Overtaken: "${params.projectTitle}" lost Rank #1 on BumpOne!`
    : `⚡ Billboard Alert: "${params.projectTitle}" dropped from Rank #${params.previousRank} to #${params.newRank}`;

  const heading = isGraveyard
    ? 'Your project entered the Graveyard (#101)'
    : isKingLost
    ? 'Your billboard crown was seized!'
    : `Rank dropped to #${params.newRank}`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0d0f15; color: #f3f4f6; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; padding: 32px 24px;">
      <div style="padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="https://bumpone.lol/bumpone-logo.png" alt="BumpOne" width="28" height="28" style="vertical-align: middle; border-radius: 6px; display: inline-block;" />
          <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; vertical-align: middle;">
            BumpOne<span style="color: #f59e0b;">.lol</span>
          </span>
        </div>
        <span style="background-color: ${isGraveyard ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${isGraveyard ? '#f87171' : '#fbbf24'}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; font-family: monospace;">
          ${isGraveyard ? 'Casualty #101' : 'Rank Alert'}
        </span>
      </div>

      <div style="padding: 28px 0;">
        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
          ${heading}
        </h2>
        <p style="font-size: 14px; color: #9ca3af; line-height: 1.6; margin-bottom: 24px;">
          Challenger <strong style="color: #ffffff;">${escapeHtml(params.promotedBidder)}</strong> placed <strong style="color: #22d3ee;">${escapeHtml(params.promotedAmountFormatted)}</strong> on <strong style="color: #ffffff;">"${escapeHtml(params.promotedTitle)}"</strong>, displacing your billboard slot.
        </p>

        <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px; margin-bottom: 28px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #9ca3af;">Target Project:</span>
            <span style="font-size: 13px; font-weight: 600; color: #ffffff;">${escapeHtml(params.projectTitle)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #9ca3af;">Previous Rank:</span>
            <span style="font-size: 13px; font-weight: 600; color: #34d399;">#${params.previousRank}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 12px; color: #9ca3af;">Current Position:</span>
            <span style="font-size: 13px; font-weight: 700; color: ${isGraveyard ? '#f87171' : '#fbbf24'};">${isGraveyard ? 'Rank #101 (Graveyard)' : `#${params.newRank}`}</span>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0 16px;">
          <a href="${escapeHtml(params.reclaimUrl)}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000000; font-weight: 700; font-size: 14px; text-decoration: none; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);">
            ⚡ Reclaim Your Billboard Slot
          </a>
        </div>
      </div>

      <div style="padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #6b7280; text-align: center; line-height: 1.5;">
        You received this because you own a slot on BumpOne.lol.<br />
        Manage alert settings or unsubscribe at <a href="https://bumpone.lol/?alerts=true" style="color: #9ca3af; text-decoration: underline;">bumpone.lol/?alerts=true</a>.
      </div>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      replyTo: 'support@bumpone.lol',
      subject,
      text: `${subject}\n\nChallenger ${params.promotedBidder} placed ${params.promotedAmountFormatted} on "${params.promotedTitle}", moving "${params.projectTitle}" from Rank #${params.previousRank} to #${params.newRank}.\n\nReclaim your billboard position now: ${params.reclaimUrl}`,
      html: htmlContent,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to dispatch outbid alert' };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
