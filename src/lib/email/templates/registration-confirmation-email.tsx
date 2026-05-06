type RegistrationConfirmationEmailProps = {
  firstName: string;
  lastName: string;
  eventTitle: string;
  tierLabel: string;
  totalDue: string;
  created: boolean;
  resumeUrl?: string;
  registrationId: string;
  normalizedEmail: string;
};

const styles = {
  body: {
    margin: 0,
    padding: "24px",
    fontFamily: "system-ui,-apple-system,sans-serif",
    lineHeight: 1.55,
    color: "#1c1917",
    background: "#f6f7f9",
  },
  card: {
    maxWidth: "560px",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "12px",
    padding: "28px",
    border: "1px solid #e7e5e4",
  },
  p: {
    margin: "0 0 16px",
    fontSize: "15px",
  },
  small: {
    margin: "24px 0 0",
    fontSize: "12px",
    color: "#78716c",
  },
  link: {
    margin: "0 0 8px",
    fontSize: "14px",
  },
  footerWrap: {
    marginTop: "18px",
    paddingTop: "14px",
    borderTop: "1px solid #e7e5e4",
  },
  footerLine: {
    margin: "0 0 6px",
    fontSize: "13px",
    color: "#57534e",
  },
} as const;

function SharedContactFooter() {
  return (
    <div style={styles.footerWrap}>
      <p style={styles.footerLine}>Tel +1 301-965-0081</p>
      <p style={styles.footerLine}>email : info@G-dna.org</p>
      <p style={{ ...styles.footerLine, marginBottom: 0 }}>
        Location: Baltimore 21205
      </p>
    </div>
  );
}

export function RegistrationConfirmationEmail({
  firstName,
  lastName,
  eventTitle,
  tierLabel,
  totalDue,
  created,
  resumeUrl,
  registrationId,
  normalizedEmail,
}: RegistrationConfirmationEmailProps) {
  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <p style={{ ...styles.p, margin: "0 0 12px" }}>
          <strong>
            {firstName} {lastName}
          </strong>
        </p>

        <p style={styles.p}>
          {created ? "Thank you for registering for " : "We've saved your latest details for "}
          <strong>{eventTitle}</strong>.
        </p>

        <p style={styles.p}>
          <strong>Tier:</strong> {tierLabel}
          <br />
          <strong>Total:</strong> {totalDue}
        </p>

        <p style={{ ...styles.p, margin: "0 0 20px" }}>
          <strong>Next:</strong> complete secure payment through Zeffy from the registration page.
        </p>

        {resumeUrl ? (
          <p style={styles.link}>
            <a href={resumeUrl}>{resumeUrl}</a>
          </p>
        ) : null}

        <p style={styles.small}>
          Reference ID: {registrationId} · {normalizedEmail}
        </p>
        <SharedContactFooter />
      </div>
    </div>
  );
}
