'use client';

import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const DEFAULT_MARGIN_MM = 10;
const PX_PER_MM = 96 / 25.4;

const FONT_OPTIONS: FontOption[] = [
  {
    id: "helvetica",
    label: "Helvetica",
    css: "Helvetica, Arial, sans-serif",
    pdfFamily: "helvetica",
  },
  {
    id: "times",
    label: "Times New Roman",
    css: '"Times New Roman", Times, serif',
    pdfFamily: "times",
  },
  {
    id: "courier",
    label: "Courier New",
    css: '"Courier New", Courier, monospace',
    pdfFamily: "courier",
  },
];

const SAMPLE_TEXT = `Typography lets information breathe. The flow of paragraphs creates rhythm, guiding the reader across the page.

Multi-column grids are used in newspapers, magazines, and bilingual publications because they keep the eye engaged.

ഇതൊരു മലയാള വാചകമാണ്. പലഭാഷകളിൽ ഉള്ള എഴുത്തുകൾ ഒരുമിച്ച് കൈകാര്യം ചെയ്യാനുള്ള കഴിവ് ഈ ഉപകരണത്തിനുണ്ട്.`;

type LayoutColumn = {
  lines: string[];
};

type LayoutPage = {
  columns: LayoutColumn[];
};

type LayoutResult = {
  pages: LayoutPage[];
};

type FontOption = {
  id: string;
  label: string;
  css: string;
  pdfFamily: string;
};

type ColumnMode = "equal" | "custom";

interface LayoutConfig {
  text: string;
  columns: number;
  columnWidthsMm: number[];
  fontCss: string;
  fontSizePx: number;
  lineHeightPx: number;
  columnHeightPx: number;
}

const mmToPx = (mm: number) => mm * PX_PER_MM;

const pxToMm = (px: number) => px / PX_PER_MM;

export default function Home() {
  const [text, setText] = useState<string>(SAMPLE_TEXT);
  const [columnCount, setColumnCount] = useState<number>(8);
  const [fontId, setFontId] = useState<string>(FONT_OPTIONS[0].id);
  const [fontSize, setFontSize] = useState<number>(12);
  const [lineSpacing, setLineSpacing] = useState<number>(1.2);
  const [marginTop, setMarginTop] = useState<number>(DEFAULT_MARGIN_MM);
  const [marginRight, setMarginRight] = useState<number>(DEFAULT_MARGIN_MM);
  const [marginBottom, setMarginBottom] = useState<number>(DEFAULT_MARGIN_MM);
  const [marginLeft, setMarginLeft] = useState<number>(DEFAULT_MARGIN_MM);
  const [columnGap, setColumnGap] = useState<number>(4);
  const [columnMode, setColumnMode] = useState<ColumnMode>("equal");
  const [customWidthInput, setCustomWidthInput] = useState<string>("");
  const [isClient, setIsClient] = useState<boolean>(false);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const font = useMemo(
    () => FONT_OPTIONS.find((option) => option.id === fontId) ?? FONT_OPTIONS[0],
    [fontId],
  );

  const lineHeightPx = useMemo(
    () => Math.max(fontSize * lineSpacing, fontSize * 1.05),
    [fontSize, lineSpacing],
  );

  const columnHeightPx = useMemo(() => {
    const usableHeightMm = Math.max(
      PAGE_HEIGHT_MM - marginTop - marginBottom,
      pxToMm(lineHeightPx),
    );
    return mmToPx(usableHeightMm);
  }, [lineHeightPx, marginBottom, marginTop]);

  const columnWidthsMm = useMemo(() => {
    const availableWidthMm = Math.max(
      PAGE_WIDTH_MM - marginLeft - marginRight,
      20,
    );
    const totalGapMm = columnGap * Math.max(columnCount - 1, 0);
    const contentWidthMm = Math.max(availableWidthMm - totalGapMm, columnCount);

    if (columnMode === "equal") {
      const equalWidth = contentWidthMm / columnCount;
      return Array.from({ length: columnCount }, () => equalWidth);
    }

    const parsed = customWidthInput
      .split(/[,\s]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (parsed.length === 0) {
      const fallback = contentWidthMm / columnCount;
      return Array.from({ length: columnCount }, () => fallback);
    }

    const widths = Array.from({ length: columnCount }, (_, index) => {
      const source = parsed[index % parsed.length];
      return source > 0 ? source : 1;
    });

    const sum = widths.reduce((total, value) => total + value, 0);
    const scale = sum > 0 ? contentWidthMm / sum : 1;

    return widths.map((width) => Math.max(width * scale, contentWidthMm / columnCount / 4));
  }, [
    columnCount,
    columnGap,
    columnMode,
    customWidthInput,
    marginLeft,
    marginRight,
  ]);

  const layout = useMemo(() => {
    if (!isClient) {
      return { pages: [] } satisfies LayoutResult;
    }

    return layoutText({
      text,
      columns: columnCount,
      columnWidthsMm,
      fontCss: font.css,
      fontSizePx: fontSize,
      lineHeightPx,
      columnHeightPx,
    });
  }, [
    columnCount,
    columnWidthsMm,
    font.css,
    fontSize,
    isClient,
    lineHeightPx,
    columnHeightPx,
    text,
  ]);

  useEffect(() => {
    pageRefs.current = pageRefs.current.slice(0, layout.pages.length);
  }, [layout.pages.length]);

  const handleColumnCountChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setColumnCount(Number(event.target.value));
  };

  const handleExportPdf = async () => {
    if (layout.pages.length === 0) {
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const lineHeightMm = pxToMm(lineHeightPx);
    const fontSizePt = (fontSize * 72) / 96;

    layout.pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) {
        doc.addPage();
      }

      doc.setFont(font.pdfFamily, "normal");
      doc.setFontSize(fontSizePt);

      page.columns.forEach((column, columnIndex) => {
        const offsetX =
          marginLeft +
          columnWidthsMm.slice(0, columnIndex).reduce((total, width) => total + width, 0) +
          columnGap * columnIndex;

        let y = marginTop;

        column.lines.forEach((line) => {
          const printable = line === "" ? " " : line;
          doc.text(printable, offsetX, y, {
            baseline: "top",
            maxWidth: columnWidthsMm[columnIndex],
          });
          y += lineHeightMm;
        });
      });
    });

    doc.save("multi-column-a4-layout.pdf");
  };

  const handleExportImages = async () => {
    if (layout.pages.length === 0) {
      return;
    }

    const html2canvas = (await import("html2canvas")).default;
    const zip = new JSZip();

    for (let index = 0; index < pageRefs.current.length; index += 1) {
      const element = pageRefs.current[index];
      if (!element) {
        continue;
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      zip.file(`page-${index + 1}.png`, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "multi-column-a4-pages.zip");
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 lg:flex-row">
        <section className="w-full rounded-xl bg-white p-6 shadow-lg lg:max-w-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900">
              Multi-Column A4 Text Layout Maker
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Paste text, tune layout, and export ready-to-print pages.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Text Content
              </label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="mt-2 h-48 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Paste your text here"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Columns
                </label>
                <select
                  value={columnCount}
                  onChange={handleColumnCountChange}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Font Family
                </label>
                <select
                  value={fontId}
                  onChange={(event) => setFontId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  min={6}
                  max={64}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value) || 1)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Line Spacing
                </label>
                <input
                  type="number"
                  step={0.05}
                  min={1}
                  max={3}
                  value={lineSpacing}
                  onChange={(event) =>
                    setLineSpacing(Number(event.target.value) || 1)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700">
                Page Margins (mm)
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <MarginInput label="Top" value={marginTop} onChange={setMarginTop} />
                <MarginInput label="Right" value={marginRight} onChange={setMarginRight} />
                <MarginInput label="Bottom" value={marginBottom} onChange={setMarginBottom} />
                <MarginInput label="Left" value={marginLeft} onChange={setMarginLeft} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Column Gap (mm)
              </label>
              <input
                type="number"
                min={0}
                value={columnGap}
                onChange={(event) => setColumnGap(Number(event.target.value) || 0)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">
                Column Widths
              </legend>
              <div className="flex items-center gap-3">
                <input
                  id="column-mode-equal"
                  type="radio"
                  name="column-mode"
                  checked={columnMode === "equal"}
                  onChange={() => setColumnMode("equal")}
                  className="h-4 w-4 border-slate-300 text-slate-800 focus:ring-slate-400"
                />
                <label htmlFor="column-mode-equal" className="text-sm text-slate-700">
                  Equal widths
                </label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="column-mode-custom"
                  type="radio"
                  name="column-mode"
                  checked={columnMode === "custom"}
                  onChange={() => setColumnMode("custom")}
                  className="mt-1 h-4 w-4 border-slate-300 text-slate-800 focus:ring-slate-400"
                />
                <label
                  htmlFor="column-mode-custom"
                  className="text-sm text-slate-700"
                >
                  Custom widths (mm, separated by commas or spaces)
                </label>
              </div>
              {columnMode === "custom" && (
                <input
                  type="text"
                  value={customWidthInput}
                  onChange={(event) => setCustomWidthInput(event.target.value)}
                  placeholder="e.g. 15, 20, 18"
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              )}
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Current widths (mm)</p>
                <p className="mt-1">
                  {columnWidthsMm
                    .map((value) => value.toFixed(1))
                    .join(" mm · ")}
                </p>
              </div>
            </fieldset>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                Export as PDF
              </button>
              <button
                onClick={handleExportImages}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                Export as Images
              </button>
            </div>
          </div>
        </section>

        <section className="w-full flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">Live Preview</h2>
            <span className="text-sm text-slate-500">
              {layout.pages.length} page{layout.pages.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex flex-wrap gap-6">
            {layout.pages.map((page, pageIndex) => (
              <div
                key={`page-${pageIndex}`}
                ref={(element) => {
                  pageRefs.current[pageIndex] = element;
                }}
                className="relative shrink-0 rounded-lg border border-slate-200 bg-white shadow-md"
                style={{
                  width: `${mmToPx(PAGE_WIDTH_MM)}px`,
                  height: `${mmToPx(PAGE_HEIGHT_MM)}px`,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    paddingTop: `${mmToPx(marginTop)}px`,
                    paddingRight: `${mmToPx(marginRight)}px`,
                    paddingBottom: `${mmToPx(marginBottom)}px`,
                    paddingLeft: `${mmToPx(marginLeft)}px`,
                    fontFamily: font.css,
                    fontSize: `${fontSize}px`,
                    lineHeight: `${lineHeightPx}px`,
                    color: "#1f2937",
                  }}
                >
                  <div className="flex h-full">
                    {page.columns.map((column, columnIndex) => (
                      <div
                        key={`page-${pageIndex}-column-${columnIndex}`}
                        className="flex h-full flex-col"
                        style={{
                          width: `${mmToPx(columnWidthsMm[columnIndex] ?? 0)}px`,
                          marginRight:
                            columnIndex === page.columns.length - 1
                              ? 0
                              : `${mmToPx(columnGap)}px`,
                        }}
                      >
                        {column.lines.map((line, lineIndex) => (
                          <span
                            key={`page-${pageIndex}-column-${columnIndex}-line-${lineIndex}`}
                            className="block"
                            style={{ minHeight: `${lineHeightPx}px` }}
                          >
                            {line === "" ? "\u00A0" : line}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {layout.pages.length === 0 && (
              <div
                className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white"
                style={{
                  maxWidth: `${mmToPx(PAGE_WIDTH_MM)}px`,
                }}
              >
                <p className="text-sm text-slate-500">Add text to see the layout preview.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type MarginInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

const MarginInput = ({ label, value, onChange }: MarginInputProps) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-slate-600">{label}</span>
    <input
      type="number"
      min={0}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
    />
  </label>
);

const layoutText = (config: LayoutConfig): LayoutResult => {
  const {
    text,
    columns,
    columnWidthsMm,
    fontCss,
    fontSizePx,
    lineHeightPx,
    columnHeightPx,
  } = config;

  const pages: LayoutPage[] = [];

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return { pages: [] };
  }

  context.font = `${fontSizePx}px ${fontCss}`;

  let currentPage: LayoutPage | null = null;
  let currentColumn: LayoutColumn | null = null;
  let currentColumnIndex = 0;
  let usedHeight = 0;
  let currentLine = "";

  const ensurePage = () => {
    if (!currentPage) {
      currentPage = { columns: [] };
      pages.push(currentPage);
      currentColumnIndex = 0;
      startColumn();
    }
  };

  const startColumn = () => {
    if (!currentPage) {
      currentPage = { columns: [] };
      pages.push(currentPage);
      currentColumnIndex = 0;
    }

    currentColumn = { lines: [] };
    currentPage.columns.push(currentColumn);
    usedHeight = 0;
  };

  const advanceColumn = () => {
    ensurePage();
    currentColumnIndex += 1;
    if (currentColumnIndex >= columns) {
      currentPage = null;
      currentColumn = null;
      ensurePage();
    } else {
      startColumn();
    }
  };

  const pushLine = (line: string) => {
    ensurePage();
    if (!currentColumn) {
      startColumn();
    }

    if (
      currentColumn &&
      lineHeightPx + usedHeight > columnHeightPx + 0.1 &&
      currentColumn.lines.length > 0
    ) {
      advanceColumn();
      ensurePage();
      if (!currentColumn) {
        startColumn();
      }
    }

    if (!currentColumn) {
      return;
    }

    currentColumn.lines.push(line);
    usedHeight += lineHeightPx;
  };

  const finalizeLine = () => {
    if (currentLine === "") {
      return;
    }
    pushLine(currentLine);
    currentLine = "";
  };

  const splitLongSegment = (segment: string, widthPx: number) => {
    if (segment === "") {
      return [] as string[];
    }

    if (context.measureText(segment).width <= widthPx) {
      return [segment];
    }

    const parts: string[] = [];
    let buffer = "";

    for (const char of Array.from(segment)) {
      const attempt = buffer + char;
      const attemptWidth = context.measureText(attempt).width;

      if (attemptWidth <= widthPx || buffer === "") {
        buffer = attempt;
      } else {
        parts.push(buffer);
        buffer = char;
      }
    }

    if (buffer) {
      parts.push(buffer);
    }

    return parts;
  };

  const tryAppend = (segment: string) => {
    ensurePage();
    if (!currentColumn) {
      startColumn();
    }

    const columnWidthPx = mmToPx(columnWidthsMm[currentColumnIndex] ?? 0);

    if (segment.trim() === "") {
      if (currentLine !== "") {
        const attempt = `${currentLine} `;
        if (context.measureText(attempt).width <= columnWidthPx) {
          currentLine = attempt;
        } else {
          finalizeLine();
        }
      }
      return;
    }

    const proposed = currentLine === "" ? segment : `${currentLine}${segment}`;
    const width = context.measureText(proposed).width;

    if (width <= columnWidthPx) {
      currentLine = proposed;
      return;
    }

    if (currentLine !== "") {
      finalizeLine();
      tryAppend(segment);
      return;
    }

    const pieces = splitLongSegment(segment, columnWidthPx);
    pieces.forEach((piece, index) => {
      currentLine = piece;
      finalizeLine();
      if (index === pieces.length - 1) {
        currentLine = "";
      }
    });
  };

  const sanitizedText = text.replace(/\r/g, "");
  const rawLines = sanitizedText.split("\n");

  rawLines.forEach((rawLine, lineIndex) => {
    const tokens = tokenizeLine(rawLine);

    tokens.forEach((token) => {
      tryAppend(token);
    });

    if (currentLine !== "") {
      finalizeLine();
    } else if (rawLine === "" && lineIndex < rawLines.length - 1) {
      pushLine("");
    }
    currentLine = "";
  });

  if (currentLine !== "") {
    finalizeLine();
  }

  if (pages.length === 0) {
    const placeholderPage: LayoutPage = {
      columns: Array.from({ length: columns }, () => ({ lines: [] })),
    };
    return { pages: [placeholderPage] };
  }

  const normalizedPages = pages.map((page) => {
    const filledColumns = [...page.columns];
    while (filledColumns.length < columns) {
      filledColumns.push({ lines: [] });
    }
    return { columns: filledColumns };
  });

  const trimmedPages = normalizedPages.filter((page, index) => {
    if (index === 0) {
      return true;
    }
    return page.columns.some((column) => column.lines.length > 0);
  });

  return {
    pages: trimmedPages.length > 0 ? trimmedPages : normalizedPages.slice(0, 1),
  };
};

const tokenizeLine = (line: string): string[] => {
  if (line === "") {
    return [];
  }

  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "word" })
      : null;

  if (segmenter) {
    const tokens: string[] = [];
    for (const segment of segmenter.segment(line)) {
      const value = segment.segment;
      if (/\s/.test(value)) {
        tokens.push(" ");
      } else {
        tokens.push(value);
      }
    }
    return tokens;
  }

  const pieces = line.split(/(\s+)/).filter((token) => token !== "");
  if (pieces.length <= 1 && !/\s/.test(line)) {
    return Array.from(line);
  }
  return pieces.map((piece) => (/\s/.test(piece) ? " " : piece));
};
