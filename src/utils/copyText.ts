/** Copy plain text. Prefer Clipboard API; fall back for Android WebView / insecure contexts. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Android WebView / permission — try execCommand
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '0';
    ta.style.top = '0';
    ta.style.width = '2px';
    ta.style.height = '2px';
    ta.style.opacity = '0.01';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
