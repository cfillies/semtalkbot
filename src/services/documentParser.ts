import axios from "axios";

export type ParsedDocument = {
  name: string;
  contentType: string;
  content: string;
};

/**
 * Infer content type from file extension
 */
function inferContentTypeFromFileName(fileName: string): string | null {
  const ext = fileName.toLowerCase().split('.').pop();
  
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
    case 'md':
      return 'text/plain';
    default:
      return null;
  }
}

/**
 * Download and parse document content based on file type
 * Supports: text/plain, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
 */
export async function parseDocumentContent(
  documentUrl: string,
  fileName: string,
  contentType?: string
): Promise<ParsedDocument | null> {
  try {
    // Download document
    console.log(`[DOC-PARSER] Downloading: ${fileName} from ${documentUrl}`);

    const response = await axios.get(documentUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    console.log(`[DOC-PARSER] Downloaded ${fileName}: status=${response.status}, size=${response.data?.byteLength || 0} bytes, content-type=${response.headers["content-type"]}`);

    const buffer = Buffer.from(response.data);
    // Prioritize response headers content-type over the Teams metadata contentType
    // Teams often sends 'application/vnd.microsoft.teams.file.download.info' which isn't useful
    const mimeType = response.headers["content-type"] || contentType || inferContentTypeFromFileName(fileName) || "text/plain";

    // Parse based on file type
    let content = "";

    if (mimeType.includes("text/plain")) {
      content = buffer.toString("utf-8");
    } else if (mimeType.includes("application/pdf")) {
      content = await parsePdf(buffer, fileName);
    } else if (
      mimeType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
      fileName.endsWith(".docx")
    ) {
      content = await parseDocx(buffer, fileName);
    } else {
      // Fallback: try to parse as text
      console.warn(`[DOC-PARSER] Unsupported type: ${mimeType}, attempting text parse`);
      content = buffer.toString("utf-8", 0, Math.min(buffer.length, 10000)).trim();
      if (!content) {
        return null;
      }
    }

    if (!content.trim()) {
      console.warn(`[DOC-PARSER] No content extracted from: ${fileName}`);
      return null;
    }

    console.log(
      `[DOC-PARSER] Parsed ${fileName}: ${Math.round(content.length / 1024)}KB of content`
    );

    return {
      name: fileName,
      contentType: mimeType,
      content: content.trim(),
    };
  } catch (error: any) {
    const statusCode = error.response?.status || "unknown";
    const statusText = error.response?.statusText || "";
    const errorMsg = error.message || String(error);
    
    console.error(`[DOC-PARSER] Failed to parse ${fileName}:`, {
      status: statusCode,
      statusText,
      message: errorMsg,
      code: error.code,
      url: documentUrl,
    });

    return null;
  }
}

/**
 * Parse PDF content using pdf-parse
 * Requires: npm install pdf-parse
 */
async function parsePdf(buffer: Buffer, fileName: string): Promise<string> {
  try {
    // Dynamically import pdf-parse to avoid hard dependency
    const pdfParse = require("pdf-parse");

    const pdfData = await pdfParse(buffer);

    const text = pdfData.text || "";
    console.log(`[DOC-PARSER] PDF ${fileName}: ${pdfData.numpages} pages, ${text.length} chars`);

    return text;
  } catch (error: any) {
    console.error(`[DOC-PARSER] PDF parsing failed for ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Parse DOCX content using mammoth
 * Requires: npm install mammoth
 */
async function parseDocx(buffer: Buffer, fileName: string): Promise<string> {
  try {
    // Dynamically import mammoth to avoid hard dependency
    const mammoth = require("mammoth");

    const result = await mammoth.extractRawText({ buffer });

    const text = result.value || "";
    console.log(`[DOC-PARSER] DOCX ${fileName}: ${text.length} chars`);

    if (result.messages && result.messages.length > 0) {
      console.debug(
        `[DOC-PARSER] DOCX parsing messages:`,
        result.messages.map((m: any) => m.message)
      );
    }

    return text;
  } catch (error: any) {
    console.error(`[DOC-PARSER] DOCX parsing failed for ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Format multiple parsed documents into context string
 */
export function formatDocumentsForContext(parsedDocs: ParsedDocument[]): string {
  if (!parsedDocs.length) {
    return "";
  }

  const formatted = parsedDocs
    .map((doc) => {
      return `---\nDocument: ${doc.name} (${doc.contentType})\n---\n${doc.content}`;
    })
    .join("\n\n");

  return `\n## Uploaded Documents\n${formatted}`;
}
