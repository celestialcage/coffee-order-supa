export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const participantLink = (eventId: string) =>
  `${window.location.origin}/e/${eventId}`;
