import { fastComplete } from '../ai';

export interface SummaryResult {
  summary: string;
  tags?: string[];
}

export async function generateSummary(
  filePath: string,
  contentPreview: string,
  extension: string,
  fileSize: number,
): Promise<SummaryResult> {
  const prompt = `Analyze this file and provide a concise summary (1-3 sentences) and relevant tags/keywords.

File: ${filePath}
Extension: ${extension}
Size: ${fileSize} bytes
Content preview:
${contentPreview.slice(0, 2000)}

Respond in JSON format:
{
  "summary": "Brief description of what this file contains or does",
  "tags": ["keyword1", "keyword2", "keyword3"]
}`;

  try {
    const response = await fastComplete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const content = response.text;
    if (!content) {
      throw new Error('No response from AI');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        summary: content.trim().slice(0, 300),
        tags: [],
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || '',
      tags: parsed.tags || [],
    };
  } catch (error) {
    console.error(`Failed to generate summary for ${filePath}:`, error);
    return {
      summary: `File: ${filePath}`,
      tags: [],
    };
  }
}
