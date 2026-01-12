import nodemailer from "nodemailer";

export type SupportTicket = {
  firebaseUid: string;
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
  category: string;
  categoryEn?: string | null;
  subCategory?: string | null;
  subCategoryEn?: string | null;
  subject: string;
  description: string;
  platform?: string | null;
  timestamp: string;
};

type SupportAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

let cachedTransport: nodemailer.Transporter | null = null;

function buildTransport(): nodemailer.Transporter | null {
  if (cachedTransport) return cachedTransport;

  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    cachedTransport = nodemailer.createTransport(smtpUrl);
    return cachedTransport;
  }

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass: pass || "" } : undefined,
  });
  return cachedTransport;
}

function buildEmailBody(ticket: SupportTicket): string {
  const lines = [
    "Cycle Care Support Ticket",
    "-------------------------",
    `Timestamp: ${ticket.timestamp}`,
    `Platform: ${ticket.platform || "unknown"}`,
    `Firebase UID: ${ticket.firebaseUid}`,
    `User Name: ${ticket.userName || "N/A"}`,
    `Email: ${ticket.email || "N/A"}`,
    `Phone: ${ticket.phone || "N/A"}`,
    "",
    `Category: ${ticket.category}${ticket.categoryEn ? ` (${ticket.categoryEn})` : ""}`,
    `Sub-category: ${ticket.subCategory || "N/A"}${ticket.subCategoryEn ? ` (${ticket.subCategoryEn})` : ""}`,
    `Subject: ${ticket.subject}`,
    "",
    "Description:",
    ticket.description || "N/A",
  ];

  return lines.join("\n");
}

export async function sendSupportEmail(
  ticket: SupportTicket,
  attachment?: SupportAttachment,
): Promise<void> {
  const transport = buildTransport();
  if (!transport) {
    console.warn("[Support] SMTP not configured; skipping support email");
    return;
  }

  const supportEmail = process.env.SUPPORT_EMAIL || "gm@cyclecaretec.com";
  const from =
    process.env.SUPPORT_EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    supportEmail;

  const subject = `[Cycle Care Support] ${ticket.category} - ${ticket.subCategory || "N/A"}`;

  await transport.sendMail({
    to: supportEmail,
    from,
    replyTo: ticket.email || undefined,
    subject,
    text: buildEmailBody(ticket),
    attachments: attachment
      ? [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          },
        ]
      : undefined,
  });
}
