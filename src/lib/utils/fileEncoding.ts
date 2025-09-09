export async function readFileAsTextSmart(file: File): Promise<string> {
	// Read file as ArrayBuffer so we can decode with various encodings
	const arrayBuffer = await file.arrayBuffer();

	// Try candidate encodings and pick the one with the fewest replacement characters
	const candidateEncodings = ['utf-8', 'windows-1252', 'iso-8859-1'] as const;
	const candidates: { label: string; text: string; replacementCount: number }[] = [];

	for (const label of candidateEncodings) {
		try {
			// Some environments may not support every label; catch and skip
			const decoder = new TextDecoder(label as unknown as string, { fatal: false });
			let text = decoder.decode(arrayBuffer);
			// Strip BOM if present
			text = text.replace(/^\uFEFF/, '');
			// Normalize to NFC to stabilize composed characters
			text = text.normalize('NFC');
			// Count replacement characters (� => U+FFFD)
			const replacementCount = (text.match(/\uFFFD/g) || []).length;
			candidates.push({ label, text, replacementCount });
		} catch {
			// Ignore unsupported encoding
		}
	}

	if (candidates.length === 0) {
		// Fallback: default browser decoding via file.text()
		const fallback = await file.text();
		return fallback.replace(/^\uFEFF/, '').normalize('NFC');
	}

	// Choose the decode with the fewest replacement characters
	candidates.sort((a, b) => a.replacementCount - b.replacementCount);
	return candidates[0].text;
}
