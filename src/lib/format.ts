// JSONボディの整形・最小化。解釈できない入力は触らず null を返し、編集中のテキストを壊さない。

export function formatJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export function minifyJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return null;
  }
}
