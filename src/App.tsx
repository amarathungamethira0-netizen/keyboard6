import { ChevronUp, CornerDownLeft, Delete, Hash, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type MappingEntry = {
  id: string;
  from: string;
  to: string;
};

type SecretLayout = {
  id: string;
  name: string;
  mappings: MappingEntry[];
};

type ConvertMode = "text" | "binary" | "decimal" | "hex" | "octal";
type EditorTarget =
  | { type: "none" }
  | { type: "decode" }
  | { type: "converter" }
  | { type: "matrixInput" }
  | { type: "matrixA" }
  | { type: "matrixB" }
  | { type: "matrixC" }
  | { type: "matrixD" }
  | { type: "presetName" }
  | { type: "layoutName" }
  | { type: "mapFrom"; id: string }
  | { type: "mapTo"; id: string };

type MatrixMode = "encode" | "decode";

type MatrixPreset = {
  id: string;
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
};

type LayoutPreset = {
  id: string;
  name: string;
  mappings: MappingEntry[];
};

declare global {
  interface Window {
    AndroidKeyboard?: {
      commitText: (text: string) => void;
      deleteText?: () => void;
      sendEnter?: () => void;
    };
  }
}

const STORAGE_KEY = "cipherboard-layout-v2";
const MATRIX_PRESETS_KEY = "cipherboard-matrix-presets-v1";
const LAYOUT_PRESETS_KEY = "cipherboard-layout-presets-v1";

const DIGIT_ROW = "1234567890";
const LETTER_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOL_ROWS = ['-/:;()$&@"', ".,?!'[]{}#", "*+=_%^~|\\<>"];

type KeyboardPage = "letters" | "symbols";

const defaultMatrixPresets: MatrixPreset[] = [
  { id: "a1-site", name: "a1 site", a: 3, b: 2, c: 5, d: 3 },
  { id: "a2-pro", name: "a2 pro", a: 7, b: 4, c: 9, d: 5 },
];

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

const defaultLayout: SecretLayout = {
  id: "default-layout",
  name: "Primary Secret Layout",
  mappings: [
    { id: uid(), from: "a", to: "@" },
    { id: uid(), from: "s", to: "$" },
    { id: uid(), from: "n", to: "~" },
    { id: uid(), from: "th", to: "#" },
  ],
};

const defaultLayoutPresets: LayoutPreset[] = [
  {
    id: "default-layout",
    name: "Primary Secret Layout",
    mappings: [
      { id: uid(), from: "a", to: "@" },
      { id: uid(), from: "s", to: "$" },
      { id: uid(), from: "n", to: "~" },
      { id: uid(), from: "th", to: "#" },
    ],
  },
];

function sortMappingsByLength(entries: MappingEntry[], key: "from" | "to") {
  return [...entries].sort((a, b) => b[key].length - a[key].length);
}

function encodeChunk(text: string, layout: SecretLayout) {
  const rules = layout.mappings.filter((r) => r.from && r.to);
  let i = 0;
  let out = "";

  while (i < text.length) {
    const matches = rules.filter((rule) => text.slice(i, i + rule.from.length) === rule.from);

    if (matches.length > 0) {
      const maxLength = Math.max(...matches.map((rule) => rule.from.length));
      const candidates = matches.filter((rule) => rule.from.length === maxLength);
      const randomRule = candidates[Math.floor(Math.random() * candidates.length)];
      out += randomRule.to;
      i += randomRule.from.length;
      continue;
    }

    out += text[i];
    i += 1;
  }

  return out;
}

function decodeChunk(text: string, layout: SecretLayout) {
  const rules = sortMappingsByLength(layout.mappings.filter((r) => r.from && r.to), "to");
  let i = 0;
  let out = "";

  while (i < text.length) {
    let matched = false;
    for (const rule of rules) {
      if (text.slice(i, i + rule.to.length) === rule.to) {
        out += rule.from;
        i += rule.to.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i += 1;
    }
  }

  return out;
}

function parseCodePoints(input: string, mode: ConvertMode) {
  const trimmed = input.trim();
  if (!trimmed) return [] as number[];

  if (mode === "text") {
    return [...input].map((char) => char.codePointAt(0) ?? 0);
  }

  const tokens = trimmed.split(/\s+/);
  const baseByMode: Record<Exclude<ConvertMode, "text">, number> = {
    binary: 2,
    decimal: 10,
    hex: 16,
    octal: 8,
  };

  const base = baseByMode[mode];
  const codePoints: number[] = [];

  for (const token of tokens) {
    const value = Number.parseInt(token, base);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid ${mode} value: ${token}`);
    }
    if (value < 0 || value > 1114111) {
      throw new Error(`Out of unicode range: ${token}`);
    }
    codePoints.push(value);
  }

  return codePoints;
}

function formatCodePoints(codePoints: number[], mode: ConvertMode) {
  if (mode === "text") {
    return codePoints.map((code) => String.fromCodePoint(code)).join("");
  }

  return codePoints
    .map((code) => {
      if (mode === "binary") return code.toString(2);
      if (mode === "decimal") return code.toString(10);
      if (mode === "hex") return code.toString(16).toUpperCase();
      return code.toString(8);
    })
    .join(" ");
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function modInverse(value: number, modulo: number) {
  let t = 0;
  let newT = 1;
  let r = modulo;
  let newR = mod(value, modulo);

  while (newR !== 0) {
    const q = Math.floor(r / newR);
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }

  if (r > 1) return null;
  return mod(t, modulo);
}

function splitToTwoDigitPairs(rawInput: string) {
  const digits = rawInput.replace(/\D/g, "");
  const padded = digits.length % 2 === 0 ? digits : `${digits}0`;
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < padded.length; i += 4) {
    const left = padded.slice(i, i + 2);
    const right = padded.slice(i + 2, i + 4);
    if (!left || !right) continue;
    pairs.push([Number.parseInt(left, 10), Number.parseInt(right, 10)]);
  }

  return { digits, padded, pairs };
}

function toTwoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

export default function App() {
  const [layout, setLayout] = useState<SecretLayout>(defaultLayout);
  const [layoutPresets, setLayoutPresets] = useState<LayoutPreset[]>(defaultLayoutPresets);
  const [selectedLayoutPresetId, setSelectedLayoutPresetId] = useState(defaultLayoutPresets[0].id);
  const [isSecretMode, setIsSecretMode] = useState(false);
  const [showDecodeDialog, setShowDecodeDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showMatrixDialog, setShowMatrixDialog] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [converterInput, setConverterInput] = useState("");
  const [converterMode, setConverterMode] = useState<ConvertMode>("text");
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("encode");
  const [matrixInput, setMatrixInput] = useState("");
  const [removeOutputSpaces, setRemoveOutputSpaces] = useState(false);
  const [matrixA, setMatrixA] = useState("3");
  const [matrixB, setMatrixB] = useState("2");
  const [matrixC, setMatrixC] = useState("5");
  const [matrixD, setMatrixD] = useState("3");
  const [matrixPresetName, setMatrixPresetName] = useState("a1 site");
  const [matrixPresets, setMatrixPresets] = useState<MatrixPreset[]>(defaultMatrixPresets);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const [editorTarget, setEditorTarget] = useState<EditorTarget>({ type: "none" });
  const [keyboardPage, setKeyboardPage] = useState<KeyboardPage>("letters");
  const [shift, setShift] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const deleteHoldTimers = useRef<{ delay: number | null; repeat: number | null }>({
    delay: null,
    repeat: null,
  });
  const lastShiftTapRef = useRef<number | null>(null);
  const keyboardRef = useRef<HTMLElement | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(280);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SecretLayout;
      if (parsed?.mappings?.length) {
        setLayout(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    const raw = localStorage.getItem(LAYOUT_PRESETS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as LayoutPreset[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setLayoutPresets(parsed);
        setSelectedLayoutPresetId(parsed[0].id);
        setLayout({ id: parsed[0].id, name: parsed[0].name, mappings: parsed[0].mappings });
      }
    } catch {
      localStorage.removeItem(LAYOUT_PRESETS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LAYOUT_PRESETS_KEY, JSON.stringify(layoutPresets));
  }, [layoutPresets]);

  useEffect(() => {
    const raw = localStorage.getItem(MATRIX_PRESETS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as MatrixPreset[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMatrixPresets(parsed);
      }
    } catch {
      localStorage.removeItem(MATRIX_PRESETS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(MATRIX_PRESETS_KEY, JSON.stringify(matrixPresets));
  }, [matrixPresets]);

  useEffect(() => {
    if (!lastAction) return;
    const t = setTimeout(() => setLastAction(""), 1200);
    return () => clearTimeout(t);
  }, [lastAction]);

  useEffect(() => {
    const el = keyboardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height;
      if (nextHeight) setKeyboardHeight(Math.ceil(nextHeight));
    });

    observer.observe(el);
    setKeyboardHeight(Math.ceil(el.getBoundingClientRect().height));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showDecodeDialog && !showConvertDialog && !showLayoutEditor && !showMatrixDialog) {
      setEditorTarget({ type: "none" });
    }
  }, [showDecodeDialog, showConvertDialog, showLayoutEditor, showMatrixDialog]);

  const shiftActive = keyboardPage === "letters" && (shift || capsLock);

  useEffect(() => stopHoldDelete, []);

  const keyboardRows = useMemo(() => {
    if (keyboardPage === "symbols") return [DIGIT_ROW, ...SYMBOL_ROWS];
    return [DIGIT_ROW, ...LETTER_ROWS];
  }, [keyboardPage]);

  const decodedPreview = useMemo(() => decodeChunk(secretInput, layout), [secretInput, layout]);

  const conversionResult = useMemo(() => {
    try {
      const codePoints = parseCodePoints(converterInput, converterMode);
      return {
        error: "",
        text: formatCodePoints(codePoints, "text"),
        binary: formatCodePoints(codePoints, "binary"),
        decimal: formatCodePoints(codePoints, "decimal"),
        hex: formatCodePoints(codePoints, "hex"),
        octal: formatCodePoints(codePoints, "octal"),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Conversion failed",
        text: "",
        binary: "",
        decimal: "",
        hex: "",
        octal: "",
      };
    }
  }, [converterInput, converterMode]);

  const converterRows = useMemo(
    () => [
      { key: "text", label: "Text", value: conversionResult.text },
      { key: "binary", label: "Binary", value: conversionResult.binary },
      { key: "decimal", label: "Decimal", value: conversionResult.decimal },
      { key: "hex", label: "Hex", value: conversionResult.hex },
      { key: "octal", label: "Octal", value: conversionResult.octal },
    ],
    [conversionResult]
  );

  const matrixCalc = useMemo(() => {
    const a = Number.parseInt(matrixA || "0", 10);
    const b = Number.parseInt(matrixB || "0", 10);
    const c = Number.parseInt(matrixC || "0", 10);
    const d = Number.parseInt(matrixD || "0", 10);
    const det = a * d - b * c;
    const detMod100 = mod(det, 100);
    const detNonZero = det !== 0;
    const detCoprime = gcd(detMod100, 100) === 1;
    const detInv = modInverse(detMod100, 100);
    const split = splitToTwoDigitPairs(matrixInput);

    let outputPairs: Array<[number, number]> = [];
    let error = "";
    let inverse: [[number, number], [number, number]] | null = null;

    if (!detNonZero) {
      error = "Invalid key: determinant must be non-zero.";
    } else if (matrixMode === "decode" && (!detCoprime || detInv === null)) {
      error = "Decode requires determinant to have a modular inverse under mod 100 (gcd(det,100)=1).";
    } else {
      if (matrixMode === "encode") {
        outputPairs = split.pairs.map(([x1, x2]) => [mod(a * x1 + b * x2, 100), mod(c * x1 + d * x2, 100)]);
      } else if (detInv !== null) {
        const ia = mod(detInv * d, 100);
        const ib = mod(detInv * -b, 100);
        const ic = mod(detInv * -c, 100);
        const id = mod(detInv * a, 100);
        inverse = [
          [ia, ib],
          [ic, id],
        ];
        outputPairs = split.pairs.map(([y1, y2]) => [mod(ia * y1 + ib * y2, 100), mod(ic * y1 + id * y2, 100)]);
      }
    }

    const outputTokens = outputPairs.flatMap(([v1, v2]) => [toTwoDigits(v1), toTwoDigits(v2)]);
    const output = outputTokens.join(removeOutputSpaces ? "" : " ").trim();

    const first = split.pairs[0];
    const firstStep =
      first && !error
        ? matrixMode === "encode"
          ? `For [x1=${first[0]}, x2=${first[1]}]: y1 = (${a}*${first[0]} + ${b}*${first[1]}) mod 100, y2 = (${c}*${first[0]} + ${d}*${first[1]}) mod 100`
          : `For [y1=${first[0]}, y2=${first[1]}]: x1 = (ia*y1 + ib*y2) mod 100, x2 = (ic*y1 + id*y2) mod 100`
        : "";

    return {
      a,
      b,
      c,
      d,
      det,
      detMod100,
      detNonZero,
      detCoprime,
      detInv,
      split,
      output,
      error,
      inverse,
      firstStep,
    };
  }, [matrixA, matrixB, matrixC, matrixD, matrixInput, matrixMode, removeOutputSpaces]);

  function insertIntoActiveEditor(text: string) {
    if (!text) return false;
    if (editorTarget.type === "matrixInput") {
      setMatrixInput((current) => current + text);
      return true;
    }
    if (editorTarget.type === "matrixA") {
      setMatrixA((current) => current + text);
      return true;
    }
    if (editorTarget.type === "matrixB") {
      setMatrixB((current) => current + text);
      return true;
    }
    if (editorTarget.type === "matrixC") {
      setMatrixC((current) => current + text);
      return true;
    }
    if (editorTarget.type === "matrixD") {
      setMatrixD((current) => current + text);
      return true;
    }
    if (editorTarget.type === "presetName") {
      setMatrixPresetName((current) => current + text);
      return true;
    }
    if (editorTarget.type === "decode") {
      setSecretInput((current) => current + text);
      return true;
    }
    if (editorTarget.type === "converter") {
      setConverterInput((current) => current + text);
      return true;
    }
    if (editorTarget.type === "layoutName") {
      setLayout((current) => ({ ...current, name: current.name + text }));
      return true;
    }
    if (editorTarget.type === "mapFrom") {
      setLayout((current) => ({
        ...current,
        mappings: current.mappings.map((item) =>
          item.id === editorTarget.id ? { ...item, from: item.from + text } : item
        ),
      }));
      return true;
    }
    if (editorTarget.type === "mapTo") {
      setLayout((current) => ({
        ...current,
        mappings: current.mappings.map((item) =>
          item.id === editorTarget.id ? { ...item, to: item.to + text } : item
        ),
      }));
      return true;
    }
    return false;
  }

  function backspaceInActiveEditor() {
    if (editorTarget.type === "matrixInput") {
      setMatrixInput((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "matrixA") {
      setMatrixA((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "matrixB") {
      setMatrixB((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "matrixC") {
      setMatrixC((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "matrixD") {
      setMatrixD((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "presetName") {
      setMatrixPresetName((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "decode") {
      setSecretInput((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "converter") {
      setConverterInput((current) => current.slice(0, -1));
      return true;
    }
    if (editorTarget.type === "layoutName") {
      setLayout((current) => ({ ...current, name: current.name.slice(0, -1) }));
      return true;
    }
    if (editorTarget.type === "mapFrom") {
      setLayout((current) => ({
        ...current,
        mappings: current.mappings.map((item) =>
          item.id === editorTarget.id ? { ...item, from: item.from.slice(0, -1) } : item
        ),
      }));
      return true;
    }
    if (editorTarget.type === "mapTo") {
      setLayout((current) => ({
        ...current,
        mappings: current.mappings.map((item) =>
          item.id === editorTarget.id ? { ...item, to: item.to.slice(0, -1) } : item
        ),
      }));
      return true;
    }
    return false;
  }

  async function copyValue(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setLastAction(`${label} copied`);
    } catch {
      setLastAction("Clipboard blocked");
    }
  }

  async function pasteToDecode() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      setSecretInput((current) => `${current}${clip}`);
      setEditorTarget({ type: "decode" });
    } catch {
      // Ignore clipboard read failure silently to avoid typing interruption.
    }
  }

  function sendToSystemInput(text: string) {
    if (!text) return;
    window.AndroidKeyboard?.commitText?.(text);
  }

  function commitText(text: string, options?: { forceUpper?: boolean }) {
    const upper = !!options?.forceUpper;
    const writeTo = upper ? text.toUpperCase() : text;

    if (insertIntoActiveEditor(writeTo)) return;

    const encoded = isSecretMode ? encodeChunk(text, layout) : text;
    const outgoing = upper ? encoded.toUpperCase() : encoded;

    // Real Android IME bridge call for direct input into any app cursor.
    if (window.AndroidKeyboard?.commitText) {
      sendToSystemInput(outgoing);
      return;
    }
  }

  function handleBackspace() {
    if (backspaceInActiveEditor()) return;

    if (window.AndroidKeyboard?.deleteText) {
      window.AndroidKeyboard.deleteText();
      return;
    }
  }

  function handleKeyPress(key: string) {
    const isLetter = /^[a-z]$/.test(key);
    const upper = isLetter && shiftActive;

    commitText(key, { forceUpper: upper });

    if (isLetter && shift && !capsLock) setShift(false);
  }

  function handleShiftTap() {
    const now = Date.now();
    if (lastShiftTapRef.current && now - lastShiftTapRef.current < 320) {
      setCapsLock(true);
      setShift(false);
      lastShiftTapRef.current = 0;
      return;
    }
    lastShiftTapRef.current = now;
    setCapsLock(false);
    setShift((current) => !current);
  }

  function startHoldDelete() {
    handleBackspace();
    deleteHoldTimers.current.delay = window.setTimeout(() => {
      deleteHoldTimers.current.repeat = window.setInterval(() => handleBackspace(), 55);
    }, 380);
  }

  function stopHoldDelete() {
    if (deleteHoldTimers.current.delay) {
      window.clearTimeout(deleteHoldTimers.current.delay);
      deleteHoldTimers.current.delay = null;
    }
    if (deleteHoldTimers.current.repeat) {
      window.clearInterval(deleteHoldTimers.current.repeat);
      deleteHoldTimers.current.repeat = null;
    }
  }

  function switchPage(page: KeyboardPage) {
    setKeyboardPage(page);
    if (page === "symbols") {
      setShift(false);
      setCapsLock(false);
    }
  }

  function handleEnter() {
    if (insertIntoActiveEditor("\n")) return;

    if (window.AndroidKeyboard?.sendEnter) {
      window.AndroidKeyboard.sendEnter();
      return;
    }
    commitText("\n");
  }

  function updateMapping(id: string, key: "from" | "to", value: string) {
    setLayout((current) => ({
      ...current,
      mappings: current.mappings.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    }));
  }

  function addMapping() {
    setLayout((current) => ({
      ...current,
      mappings: [...current.mappings, { id: uid(), from: "", to: "" }],
    }));
  }

  function removeMapping(id: string) {
    setLayout((current) => ({
      ...current,
      mappings: current.mappings.filter((item) => item.id !== id),
    }));
  }

  function cloneMappings(mappings: MappingEntry[]) {
    return mappings.map((item) => ({ ...item, id: uid() }));
  }

  function loadLayoutPreset(id: string) {
    const preset = layoutPresets.find((item) => item.id === id);
    if (!preset) return;
    setSelectedLayoutPresetId(id);
    setLayout({ id: preset.id, name: preset.name, mappings: cloneMappings(preset.mappings) });
    setEditorTarget({ type: "layoutName" });
  }

  function saveLayoutPreset() {
    const normalized = {
      id: selectedLayoutPresetId,
      name: layout.name.trim() || "Custom Layout",
      mappings: cloneMappings(layout.mappings),
    };

    setLayoutPresets((current) => {
      const hasCurrent = current.some((item) => item.id === selectedLayoutPresetId);
      if (!hasCurrent) return [normalized, ...current];
      return current.map((item) => (item.id === selectedLayoutPresetId ? normalized : item));
    });

    setLastAction("Layout saved");
  }

  function createLayoutPreset() {
    const newPreset: LayoutPreset = {
      id: uid(),
      name: `Layout ${layoutPresets.length + 1}`,
      mappings: [{ id: uid(), from: "", to: "" }],
    };
    setLayoutPresets((current) => [newPreset, ...current]);
    setSelectedLayoutPresetId(newPreset.id);
    setLayout({ id: newPreset.id, name: newPreset.name, mappings: cloneMappings(newPreset.mappings) });
  }

  function closeAllPanels() {
    setShowDecodeDialog(false);
    setShowConvertDialog(false);
    setShowLayoutEditor(false);
    setShowMatrixDialog(false);
    setEditorTarget({ type: "none" });
  }

  function togglePanel(panel: "decode" | "convert" | "layout" | "matrix") {
    if (panel === "decode") {
      const next = !showDecodeDialog;
      setShowDecodeDialog(next);
      setShowConvertDialog(false);
      setShowLayoutEditor(false);
      setShowMatrixDialog(false);
      setEditorTarget(next ? { type: "decode" } : { type: "none" });
      return;
    }
    if (panel === "convert") {
      const next = !showConvertDialog;
      setShowConvertDialog(next);
      setShowDecodeDialog(false);
      setShowLayoutEditor(false);
      setShowMatrixDialog(false);
      setEditorTarget(next ? { type: "converter" } : { type: "none" });
      return;
    }
    if (panel === "matrix") {
      const next = !showMatrixDialog;
      setShowMatrixDialog(next);
      setShowDecodeDialog(false);
      setShowConvertDialog(false);
      setShowLayoutEditor(false);
      setEditorTarget(next ? { type: "matrixInput" } : { type: "none" });
      return;
    }
    const next = !showLayoutEditor;
    setShowLayoutEditor(next);
    setShowDecodeDialog(false);
    setShowConvertDialog(false);
    setShowMatrixDialog(false);
    setEditorTarget(next ? { type: "layoutName" } : { type: "none" });
  }

  function saveMatrixPreset() {
    const name = matrixPresetName.trim();
    if (!name) {
      setLastAction("Preset name required");
      return;
    }
    const preset: MatrixPreset = {
      id: uid(),
      name,
      a: matrixCalc.a,
      b: matrixCalc.b,
      c: matrixCalc.c,
      d: matrixCalc.d,
    };
    setMatrixPresets((current) => [preset, ...current.filter((item) => item.name !== name)]);
    setLastAction(`Preset saved: ${name}`);
  }

  function loadMatrixPreset(id: string) {
    const preset = matrixPresets.find((item) => item.id === id);
    if (!preset) return;
    setMatrixA(String(preset.a));
    setMatrixB(String(preset.b));
    setMatrixC(String(preset.c));
    setMatrixD(String(preset.d));
    setMatrixPresetName(preset.name);
    setLastAction(`Preset loaded: ${preset.name}`);
  }

  function deleteMatrixPreset(id: string) {
    const target = matrixPresets.find((item) => item.id === id);
    setMatrixPresets((current) => current.filter((item) => item.id !== id));
    if (target) setLastAction(`Preset deleted: ${target.name}`);
  }

  return (
    <>

      <section
        ref={keyboardRef}
        className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-slate-700/40 bg-slate-900/95 px-2 pb-3 pt-2"
      >
        <div className="w-full">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-300">
            <button
              onClick={() => togglePanel("layout")}
              className="rounded-md border border-white/20 px-2 py-1 hover:bg-white/10"
            >
              {showLayoutEditor ? "Close" : "Layout"}
            </button>
            <label className="flex items-center gap-2">
              <span>Normal</span>
              <button
                onClick={() => setIsSecretMode((v) => !v)}
                className={`h-6 w-12 rounded-full border transition ${
                  isSecretMode
                    ? "border-cyan-300/80 bg-cyan-400/30"
                    : "border-white/20 bg-white/10"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-slate-200 ${isSecretMode ? "ml-6" : "ml-1"}`}
                />
              </button>
              <span>Secret</span>
            </label>
            <button
              onClick={() => togglePanel("decode")}
              className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 hover:bg-slate-600/20"
            >
              {showDecodeDialog ? "Close" : "Decode"}
            </button>
            <button
              onClick={() => togglePanel("convert")}
              className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 hover:bg-slate-600/20"
            >
              {showConvertDialog ? "Close" : "Convert"}
            </button>
            <button
              onClick={() => togglePanel("matrix")}
              className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 hover:bg-slate-600/20"
            >
              {showMatrixDialog ? "Close" : "Matrix"}
            </button>
          </div>

          <div className="space-y-1">
            {keyboardRows.map((row, rowIndex) => {
              const isDigitRow = rowIndex === 0;
              const isLastRow = rowIndex === keyboardRows.length - 1;

              return (
                <div key={`${keyboardPage}-${row}`} className="flex justify-center gap-1">
                  {row.split("").map((key) => {
                    const isLetter = /^[a-z]$/.test(key);
                    const label = isLetter && shiftActive ? key.toUpperCase() : key;

                    return (
                      <button
                        key={key}
                        onClick={() => handleKeyPress(key)}
                        className={[
                          "h-11 flex-1 max-w-[2.55rem] rounded-md border font-mono text-[0.95rem] font-medium",
                          "active:bg-slate-500/30",
                          isDigitRow
                            ? "border-slate-600/30 bg-slate-800/50 text-slate-300 active:bg-slate-600/40"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-200 active:bg-slate-600/40",
                          isLetter && shiftActive ? "border-slate-500/60 bg-slate-700/50" : "",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {isLastRow && (
                    <button
                      onPointerDown={startHoldDelete}
                      onPointerUp={stopHoldDelete}
                      onPointerLeave={stopHoldDelete}
                      onPointerCancel={stopHoldDelete}
                      onClick={(e) => e.preventDefault()}
                      className="flex h-11 flex-1 max-w-[3.1rem] items-center justify-center rounded-md border border-slate-600/30 bg-slate-700/40 text-slate-400 active:bg-slate-600/50"
                      aria-label="Backspace (hold to keep deleting)"
                    >
                      <Delete className="h-5 w-5" strokeWidth={1.9} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-1 grid grid-cols-[2.75rem_2.75rem_1fr_2.75rem_3.4rem] gap-1">
            <button
              onClick={handleShiftTap}
              disabled={keyboardPage === "symbols"}
              className={[
                "flex h-11 items-center justify-center rounded-md border",
                keyboardPage === "symbols"
                  ? "pointer-events-none border-transparent bg-slate-800/30 opacity-30"
                  : capsLock
                    ? "border-slate-500/60 bg-slate-700/50 text-slate-300"
                    : shift
                      ? "border-slate-500/60 bg-slate-700/50 text-slate-200"
                      : "border-slate-600/30 bg-slate-800/40 text-slate-400 active:bg-slate-600/40",
              ].join(" ")}
              aria-label="Shift"
            >
              <span className="relative">
                <ChevronUp className="h-5 w-5" strokeWidth={2.4} />
                {capsLock && (
                  <Lock className="absolute -right-2.5 -bottom-1.5 h-2.5 w-2.5 text-slate-400" strokeWidth={3} />
                )}
              </span>
            </button>

            <button
              onClick={() => switchPage(keyboardPage === "letters" ? "symbols" : "letters")}
              className="flex h-11 items-center justify-center rounded-md border border-slate-600/30 bg-slate-800/40 text-[0.7rem] font-semibold text-slate-300 active:bg-slate-600/40"
              aria-label="Toggle symbols and numbers"
            >
              {keyboardPage === "letters" ? (
                <Hash className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                <span className="font-mono">?123</span>
              )}
            </button>

            <button
              onClick={() => commitText(" ")}
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-slate-600/30 bg-slate-800/40 text-xs font-medium tracking-[0.18em] text-slate-300 uppercase active:bg-slate-600/40"
            >
              <span className="font-mono text-sm text-slate-500">
                {keyboardPage === "letters" ? "abc" : "123"}
              </span>
              space
            </button>

            <button
              onClick={() => commitText(keyboardPage === "letters" ? "." : ",")}
              className="flex h-11 items-center justify-center rounded-md border border-slate-600/30 bg-slate-800/40 font-mono text-base text-slate-300 active:bg-slate-600/40"
              aria-label="Punctuation"
            >
              {keyboardPage === "letters" ? "." : ","}
            </button>

            <button
              onClick={handleEnter}
              className="flex h-11 items-center justify-center rounded-md border border-slate-600/30 bg-slate-800/40 text-slate-300 active:bg-slate-600/40"
              aria-label="Enter"
            >
              <CornerDownLeft className="h-5 w-5" strokeWidth={2.1} />
            </button>
          </div>

        </div>
      </section>

      {showDecodeDialog && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2 pt-2"
          style={{ bottom: keyboardHeight }}
        >
          <div className="pointer-events-auto mx-auto h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700/40 bg-slate-900 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-lg font-medium">Decode Secret Message</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={pasteToDecode}
                    className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 text-xs"
                  >
                    Paste
                  </button>
                  <button
                    onClick={closeAllPanels}
                    className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
              <textarea
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onFocus={() => setEditorTarget({ type: "decode" })}
                onClick={() => setEditorTarget({ type: "decode" })}
                placeholder="Paste secret message"
                readOnly={!!window.AndroidKeyboard}
                className="min-h-24 w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-sm outline-none"
              />
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-emerald-300">Decoded</p>
              <div className="mt-1 grid max-w-full grid-cols-[auto_1fr] items-center gap-2 overflow-hidden rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-2">
                <button
                  onClick={() => copyValue(decodedPreview, "Decoded text")}
                  disabled={!decodedPreview}
                  className="rounded-md border border-emerald-300/50 px-2 py-1 text-[11px] text-emerald-100 disabled:opacity-40"
                >
                  Copy
                </button>
                <p className="font-mono min-h-8 max-w-full text-sm break-all whitespace-pre-wrap">
                  {decodedPreview || "Decoded output appears here"}
                </p>
              </div>
            </div>
          </div>
        )}

      {showConvertDialog && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2 pt-2"
          style={{ bottom: keyboardHeight }}
        >
          <div className="pointer-events-auto mx-auto h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700/40 bg-slate-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-medium">Text/Base Converter</h2>
              <button
                onClick={closeAllPanels}
                className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 text-xs"
              >
                Close
              </button>
            </div>
              <p className="mb-2 text-xs text-slate-300">Use spaces between numbers for multiple characters.</p>
              <select
                value={converterMode}
                onChange={(e) => setConverterMode(e.target.value as ConvertMode)}
                className="mb-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm outline-none"
              >
                <option value="text">Input type: Text</option>
                <option value="binary">Input type: Binary</option>
                <option value="decimal">Input type: Decimal</option>
                <option value="hex">Input type: Hex</option>
                <option value="octal">Input type: Octal</option>
              </select>
              <textarea
                value={converterInput}
                onChange={(e) => setConverterInput(e.target.value)}
                onFocus={() => setEditorTarget({ type: "converter" })}
                onClick={() => setEditorTarget({ type: "converter" })}
                placeholder="Type text or numeric values"
                readOnly={!!window.AndroidKeyboard}
                className="min-h-20 w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-sm outline-none"
              />

              {conversionResult.error ? (
                <p className="mt-2 rounded-md border border-rose-300/35 bg-rose-400/15 p-2 text-xs text-rose-100">
                  {conversionResult.error}
                </p>
              ) : (
                <div className="mt-2 space-y-1.5 text-xs">
                  {converterRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-white/15 bg-slate-950 p-2"
                    >
                      <button
                        onClick={() => copyValue(row.value, row.label)}
                        disabled={!row.value}
                        className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-1 text-[11px] text-cyan-100 disabled:opacity-40"
                      >
                        Copy
                      </button>
                      <p className="break-all">
                        {row.label}: {row.value || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  onClick={() => commitText(conversionResult.text)}
                  disabled={!conversionResult.text || !!conversionResult.error}
                  className="rounded-md border border-slate-600/40 bg-slate-700/40 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
                >
                  Send text
                </button>
                <button
                  onClick={() => commitText(conversionResult.hex)}
                  disabled={!conversionResult.hex || !!conversionResult.error}
                  className="rounded-md border border-slate-600/40 bg-slate-700/40 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
                >
                  Send hex
                </button>
              </div>
            </div>
          </div>
        )}

      {showMatrixDialog && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2 pt-2"
          style={{ bottom: keyboardHeight }}
        >
          <div className="pointer-events-auto mx-auto h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700/40 bg-slate-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-medium">Matrix Cipher (mod 100)</h2>
              <button
                onClick={closeAllPanels}
                className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 text-xs"
              >
                Close
              </button>
            </div>

              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setMatrixMode("encode")}
                  className={`rounded-md px-2 py-1.5 text-xs ${
                    matrixMode === "encode"
                      ? "border border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
                      : "border border-white/20"
                  }`}
                >
                  Encode
                </button>
                <button
                  onClick={() => setMatrixMode("decode")}
                  className={`rounded-md px-2 py-1.5 text-xs ${
                    matrixMode === "decode"
                      ? "border border-emerald-300/60 bg-emerald-400/20 text-emerald-100"
                      : "border border-white/20"
                  }`}
                >
                  Decode
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-300">Key matrix K = [[a, b], [c, d]]</p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <input
                  value={matrixA}
                  onChange={(e) => setMatrixA(e.target.value)}
                  placeholder="a"
                  onFocus={() => setEditorTarget({ type: "matrixA" })}
                  onClick={() => setEditorTarget({ type: "matrixA" })}
                  readOnly={!!window.AndroidKeyboard}
                  className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                />
                <input
                  value={matrixB}
                  onChange={(e) => setMatrixB(e.target.value)}
                  placeholder="b"
                  onFocus={() => setEditorTarget({ type: "matrixB" })}
                  onClick={() => setEditorTarget({ type: "matrixB" })}
                  readOnly={!!window.AndroidKeyboard}
                  className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                />
                <input
                  value={matrixC}
                  onChange={(e) => setMatrixC(e.target.value)}
                  placeholder="c"
                  onFocus={() => setEditorTarget({ type: "matrixC" })}
                  onClick={() => setEditorTarget({ type: "matrixC" })}
                  readOnly={!!window.AndroidKeyboard}
                  className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                />
                <input
                  value={matrixD}
                  onChange={(e) => setMatrixD(e.target.value)}
                  placeholder="d"
                  onFocus={() => setEditorTarget({ type: "matrixD" })}
                  onClick={() => setEditorTarget({ type: "matrixD" })}
                  readOnly={!!window.AndroidKeyboard}
                  className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                />
              </div>

              <p className="mt-2 text-xs text-slate-300">
                det = a*d - b*c = {matrixCalc.det} | det mod 100 = {matrixCalc.detMod100}
              </p>
              {!matrixCalc.detNonZero && (
                <p className="mt-1 text-xs text-rose-300">Invalid key: determinant must be non-zero.</p>
              )}
              {matrixMode === "decode" && matrixCalc.detNonZero && !matrixCalc.detCoprime && (
                <p className="mt-1 text-xs text-rose-300">Decode blocked: gcd(det,100) must be 1.</p>
              )}
              {matrixMode === "decode" && matrixCalc.inverse && (
                <p className="mt-1 text-xs text-emerald-300">
                  K^-1 mod 100 = [[{matrixCalc.inverse[0][0]}, {matrixCalc.inverse[0][1]}], [{matrixCalc.inverse[1][0]},{" "}
                  {matrixCalc.inverse[1][1]}]]
                </p>
              )}

              <textarea
                value={matrixInput}
                onChange={(e) => setMatrixInput(e.target.value)}
                onFocus={() => setEditorTarget({ type: "matrixInput" })}
                onClick={() => setEditorTarget({ type: "matrixInput" })}
                placeholder="Input digits. Ex: 546578743A2068690A"
                readOnly={!!window.AndroidKeyboard}
                className="mt-2 min-h-20 w-full rounded-md border border-white/15 bg-slate-950 p-2 text-sm outline-none"
              />

              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={removeOutputSpaces}
                    onChange={(e) => setRemoveOutputSpaces(e.target.checked)}
                  />
                  Remove spaces from output
                </label>
                <p>Pairs: {matrixCalc.split.pairs.length}</p>
              </div>

              {matrixCalc.error ? (
                <p className="mt-2 rounded-md border border-rose-300/35 bg-rose-400/15 p-2 text-xs text-rose-100">
                  {matrixCalc.error}
                </p>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-white/15 bg-slate-950 p-2 text-xs">
                    <button
                      onClick={() => copyValue(matrixCalc.output, "Matrix output")}
                      disabled={!matrixCalc.output}
                      className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-1 text-cyan-100 disabled:opacity-40"
                    >
                      Copy
                    </button>
                    <p className="break-all">{matrixCalc.output || "Output appears here"}</p>
                    <button
                      onClick={() => commitText(matrixCalc.output)}
                      disabled={!matrixCalc.output}
                      className="rounded-md border border-emerald-300/40 bg-emerald-400/15 px-2 py-1 text-emerald-100 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                  {matrixCalc.firstStep && (
                    <pre className="mt-2 overflow-x-auto rounded-md border border-white/15 bg-slate-950 p-2 text-[11px] text-slate-300">
{`y1 = (a*x1 + b*x2) mod 100
y2 = (c*x1 + d*x2) mod 100
${matrixCalc.firstStep}`}
                    </pre>
                  )}
                </>
              )}

              <div className="mt-3 border-t border-white/10 pt-2">
                <p className="text-xs text-slate-300">Preset name</p>
                <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
                  <input
                    value={matrixPresetName}
                    onChange={(e) => setMatrixPresetName(e.target.value)}
                    onFocus={() => setEditorTarget({ type: "presetName" })}
                    onClick={() => setEditorTarget({ type: "presetName" })}
                    readOnly={!!window.AndroidKeyboard}
                    className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={saveMatrixPreset}
                    className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-2 text-xs text-cyan-100"
                  >
                    Save
                  </button>
                </div>
                <div className="mt-2 max-h-24 space-y-1 overflow-y-auto pr-1">
                  {matrixPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded-md border border-white/10 bg-slate-950/60 p-1.5 text-xs"
                    >
                      <p className="truncate">{preset.name}</p>
                      <button
                        onClick={() => loadMatrixPreset(preset.id)}
                        className="rounded-md border border-white/20 px-2 py-1"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteMatrixPreset(preset.id)}
                        className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300"
                      >
                        Del
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      {showLayoutEditor && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2 pt-2"
          style={{ bottom: keyboardHeight }}
        >
          <div className="pointer-events-auto mx-auto h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700/40 bg-slate-900 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">Secret Layout Editor</h2>
              <button
                onClick={closeAllPanels}
                className="rounded-md border border-slate-600/40 px-2 py-1 text-slate-300 text-xs"
              >
                Done
              </button>
            </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-1">
                <select
                  value={selectedLayoutPresetId}
                  onChange={(e) => loadLayoutPreset(e.target.value)}
                  className="rounded-lg border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                >
                  {layoutPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={createLayoutPreset}
                  className="rounded-md border border-white/20 px-2 py-2 text-xs"
                >
                  New
                </button>
                <button
                  onClick={saveLayoutPreset}
                  className="rounded-md border border-cyan-300/40 bg-cyan-400/15 px-2 py-2 text-xs text-cyan-100"
                >
                  Save
                </button>
              </div>
              <input
                value={layout.name}
                onChange={(e) => setLayout((current) => ({ ...current, name: e.target.value }))}
                onFocus={() => setEditorTarget({ type: "layoutName" })}
                onClick={() => setEditorTarget({ type: "layoutName" })}
                readOnly={!!window.AndroidKeyboard}
                className="mb-2 mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm outline-none"
              />
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {layout.mappings.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <input
                      value={item.from}
                      onChange={(e) => updateMapping(item.id, "from", e.target.value)}
                      onFocus={() => setEditorTarget({ type: "mapFrom", id: item.id })}
                      onClick={() => setEditorTarget({ type: "mapFrom", id: item.id })}
                      placeholder="from"
                      readOnly={!!window.AndroidKeyboard}
                      className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                    />
                    <input
                      value={item.to}
                      onChange={(e) => updateMapping(item.id, "to", e.target.value)}
                      onFocus={() => setEditorTarget({ type: "mapTo", id: item.id })}
                      onClick={() => setEditorTarget({ type: "mapTo", id: item.id })}
                      placeholder="to"
                      readOnly={!!window.AndroidKeyboard}
                      className="rounded-md border border-white/15 bg-slate-950 px-2 py-2 text-sm outline-none"
                    />
                    <button
                      onClick={() => removeMapping(item.id)}
                      className="rounded-md border border-white/20 px-2 py-2 text-xs"
                    >
                      Del
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addMapping}
                className="mt-2 rounded-md border border-slate-600/40 bg-slate-700/40 px-3 py-2 text-xs text-slate-300"
              >
                Add mapping
              </button>
            </div>
          </div>
        )}

    </>
  );
}
