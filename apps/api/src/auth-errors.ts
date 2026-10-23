// Only return deliberately written messages; provider errors may contain private details.
export function cloudAuthMessage(
  code: string | undefined,
  signup: boolean,
): string {
  const messages: Record<string, string> = {
    email_address_invalid:
      "Enter a real email address you can access. Example and .test addresses cannot receive a confirmation email.",
    email_address_not_authorized:
      "Confirmation email delivery is not configured for this address yet. The site owner needs to configure an email provider.",
    email_not_confirmed:
      "Confirm your email using the link in your inbox, then sign in. Check your spam folder too.",
    over_email_send_rate_limit:
      "The confirmation-email sending limit has been reached. Check your inbox for an earlier confirmation link. Otherwise, try again after the provider’s hourly limit resets, or ask the site owner to configure email delivery.",
    over_request_rate_limit:
      "Too many sign-in attempts. Wait a few minutes before trying again.",
    weak_password: "Choose a stronger password with at least 10 characters.",
    email_provider_disabled:
      "Email sign-up is currently unavailable. Please try again later.",
  };
  return (
    (code && messages[code]) ||
    (signup
      ? "Could not create account. Check your details or try signing in."
      : "Email or password was not accepted.")
  );
}
