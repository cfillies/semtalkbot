import axios from "axios";

export type ParsedDocument = {
  name: string;
  contentType: string;
  content: string;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

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
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'txt':
    case 'md':
      return 'text/plain';
    default:
      return null;
  }
}

/**
 * Download and parse document content based on file type
 * Supports: text/plain, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
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
    const mimeType = (response.headers["content-type"] || contentType || inferContentTypeFromFileName(fileName) || "text/plain") as string;

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
    } else if (
      mimeType.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation") ||
      mimeType.includes("application/vnd.ms-powerpoint") ||
      fileName.endsWith(".pptx")
    ) {
      content = await parsePptx(buffer, fileName);
    } else if (
      mimeType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ||
      mimeType.includes("application/vnd.ms-excel") ||
      fileName.endsWith(".xlsx")
    ) {
      content = await parseXlsx(buffer, fileName);
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
 * Parse PPTX content by reading slide XML files inside the package.
 * This extracts text nodes from all slide files and joins them in order.
 */
async function parsePptx(buffer: Buffer, fileName: string): Promise<string> {
  try {
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name: string) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a: string, b: string) => {
        const aNum = parseInt(a.match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
        const bNum = parseInt(b.match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
        return aNum - bNum;
      });

    const slideTexts: string[] = [];

    for (const slidePath of slideFiles) {
      const slideFile = zip.file(slidePath);
      if (!slideFile) continue;

      const xml = await slideFile.async("string");
      const textMatches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)].map((match) =>
        decodeXmlEntities(match[1])
      );

      const cleaned = textMatches
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .join(" ");

      if (cleaned) {
        slideTexts.push(cleaned);
      }
    }

    const text = slideTexts.join("\n\n");
    console.log(`[DOC-PARSER] PPTX ${fileName}: ${slideFiles.length} slides, ${text.length} chars`);
    return text;
  } catch (error: any) {
    console.error(`[DOC-PARSER] PPTX parsing failed for ${fileName}:`, error.message);
    throw error;
  }
}

/**
 * Parse XLSX content by reading shared strings and worksheet XML.
 */
async function parseXlsx(buffer: Buffer, fileName: string): Promise<string> {
  try {
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(buffer);

    const sharedStrings: string[] = [];
    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    if (sharedStringsFile) {
      const xml = await sharedStringsFile.async("string");
      const matches = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/gi)];
      for (const match of matches) {
        const itemXml = match[1];
        const text = [...itemXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)]
          .map((m) => decodeXmlEntities(m[1].trim()))
          .join(" ")
          .trim();
        sharedStrings.push(text);
      }
    }

    const sheetPaths = Object.keys(zip.files)
      .filter((name: string) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a: string, b: string) => {
        const aNum = parseInt(a.match(/sheet(\d+)\.xml$/i)?.[1] || "0", 10);
        const bNum = parseInt(b.match(/sheet(\d+)\.xml$/i)?.[1] || "0", 10);
        return aNum - bNum;
      });

    const sheetRows: string[] = [];

    for (const sheetPath of sheetPaths) {
      const sheetFile = zip.file(sheetPath);
      if (!sheetFile) continue;

      const xml = await sheetFile.async("string");
      const cellMatches = [...xml.matchAll(/<c\s+[^>]*r="([^"]+)"[^>]*>([\s\S]*?)<\/c>/gi)];
      const rowMap = new Map<number, string[]>();

      for (const match of cellMatches) {
        const ref = match[1];
        const fullCellXml = match[0];
        const cellXml = match[2];

        const rowMatch = ref.match(/(\d+)/);
        const rowNumber = rowMatch ? parseInt(rowMatch[1], 10) : 0;
        const cellType = (fullCellXml.match(/<c[^>]*t="([^"]+)"/i)?.[1] || "n").toLowerCase();

        let value = "";
        if (cellType === "s") {
          const vMatch = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/i);
          const index = vMatch ? parseInt(vMatch[1], 10) : NaN;
          value = Number.isFinite(index) ? sharedStrings[index] || "" : "";
        } else {
          const tMatches = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)];
          if (tMatches.length > 0) {
            value = tMatches.map((m) => decodeXmlEntities(m[1].trim())).join(" ").trim();
          } else {
            const vMatch = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/i);
            value = vMatch ? decodeXmlEntities(vMatch[1].trim()) : "";
          }
        }

        if (!value) continue;

        const rowValues = rowMap.get(rowNumber) || [];
        rowValues.push(value);
        rowMap.set(rowNumber, rowValues);
      }

      const rows = Array.from(rowMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, values]) => values.join(" | "))
        .filter((value) => value.trim().length > 0);

      if (rows.length > 0) {
        sheetRows.push(rows.join("\n"));
      }
    }

    const text = sheetRows.join("\n\n");
    console.log(`[DOC-PARSER] XLSX ${fileName}: ${sheetPaths.length} sheets, ${text.length} chars`);
    return text;
  } catch (error: any) {
    console.error(`[DOC-PARSER] XLSX parsing failed for ${fileName}:`, error.message);
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
