import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

import { useNavigate } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  History,
  Moon,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sun,
  Users,
  X,
} from "lucide-react";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

/*
 * ---------------------------------------------------------------------------
 * FONTS
 * ---------------------------------------------------------------------------
 * This component now assumes two font families are available globally:
 *   - "Inter"        -> used for all UI text        (font-sans)
 *   - "JetBrains Mono" -> used for IPs/serial numbers  (font-mono)
 *
 * Add this once to your root index.html <head>:
 *
 *   <link rel="preconnect" href="https://fonts.googleapis.com">
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 *   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
 *
 * And extend tailwind.config.js so the default font-sans / font-mono
 * utilities resolve to these:
 *
 *   theme: {
 *     extend: {
 *       fontFamily: {
 *         sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
 *         mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
 *       },
 *     },
 *   }
 *
 * If you'd rather not touch global config, swap `font-sans`/`font-mono`
 * below for inline `style={{ fontFamily: ... }}`.
 * ---------------------------------------------------------------------------
 */

/*
 * ---------------------------------------------------------------------------
 * Theme tokens
 * ---------------------------------------------------------------------------
 * Light mode --> the table card, the header row and the
 * serial-number chips are each a visibly distinct surface instead of
 * everything collapsing to white-on-white:
 *
 *   page background   -> slate-100 (cool light grey, not white)
 *   table card        -> white + shadow-sm + slate-200 border (pops off page)
 *   table header      -> slate-50 (one step darker than the card body)
 *   serial-no chips   -> slate-100 pill so identifiers are instantly scannable
 * ---------------------------------------------------------------------------
 */
const THEME = {
  dark: {
    page: "bg-slate-950 text-slate-100",
    border: "border-slate-800",
    heading: "text-white",
    subtitle: "text-slate-400",
    iconBtn: "text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-400",
    themeToggle:
      "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
    statChip: "border-slate-800 bg-slate-900/60",
    statIconBg: "bg-slate-800/80 text-slate-400",
    statValue: "text-slate-100",
    statLabel: "text-slate-500",
    input:
      "border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-500 hover:border-slate-600",
    selectTrigger: "border-slate-700 bg-slate-900/80 text-slate-200",
    selectContent: "border-slate-700 bg-slate-900 text-slate-200",
    mutedBtn: "text-slate-400 hover:bg-slate-800 hover:text-white",
    tableWrap: "border-slate-800 bg-slate-900/40 shadow-none",
    theadWrap: "border-slate-800 bg-slate-900/95",
    theadText: "text-slate-200",
    rowBorder: "border-slate-700",
    rowHover: "hover:bg-slate-800/50",
    rowSelected: "bg-indigo-500/[0.08] hover:bg-indigo-500/[0.12]",
    cellPrimary: "text-slate-200",
    cellSecondary: "text-slate-400",
    cellDate: "text-slate-300",
    emptyIconBg: "bg-slate-800/80",
    emptyIconColor: "text-slate-500",
    emptyTitle: "text-slate-200",
    emptyDesc: "text-slate-500",
    outlineBtn: "border-slate-700 text-slate-200 hover:bg-slate-800",
    checkboxBase:
      "border-slate-500 bg-slate-950 hover:border-indigo-400 data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-500 data-[state=indeterminate]:border-indigo-500 data-[state=indeterminate]:bg-indigo-500",
    dropdownContent: "border-slate-700 bg-slate-900 text-slate-200",
    dropdownItemHover: "focus:bg-slate-800",
    dropdownSeparator: "bg-slate-700",
    paginationBtn:
      "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white",
    paginationCount: "text-slate-300",
    paginationText: "text-slate-500",
    sheetBg: "border-slate-800 bg-slate-950 text-slate-100",
    sheetSectionTitle: "text-slate-200",
    sheetBorder: "border-slate-800",
    remark: "border-slate-800 bg-slate-900/40 text-slate-400",
    detailBorder: "border-slate-800/70",
    detailLabel: "text-slate-500",
    detailValue: "text-slate-200",
    separator: "bg-slate-800",
    statusBadge:
      "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    statusDot: "text-emerald-400",
    copyIcon: "text-slate-600",
    searchIcon: "text-slate-500",
    serialChip: "bg-slate-800/70 border border-slate-700/70 text-slate-200",
    serialChipHover: "hover:border-indigo-500/50 hover:bg-slate-800",
  },
  light: {
    page: "bg-slate-100 text-slate-900",
    border: "border-slate-200",
    heading: "text-slate-900",
    subtitle: "text-slate-500",
    iconBtn: "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600",
    themeToggle: "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
    statChip: "border-slate-200 bg-white shadow-sm",
    statIconBg: "bg-slate-100 text-slate-500",
    statValue: "text-slate-900",
    statLabel: "text-slate-500",
    input:
      "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 hover:border-slate-400",
    selectTrigger: "border-slate-300 bg-white text-slate-700",
    selectContent: "border-slate-200 bg-white text-slate-700",
    mutedBtn: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    tableWrap: "border-slate-200 bg-white shadow-sm",
    theadWrap: "border-slate-200 bg-slate-50/95",
    theadText: "text-slate-700",
    rowBorder: "border-slate-200",
    rowHover: "hover:bg-slate-50",
    rowSelected: "bg-indigo-50 hover:bg-indigo-100/70",
    cellPrimary: "text-slate-800",
    cellSecondary: "text-slate-600",
    cellDate: "text-slate-700",
    emptyIconBg: "bg-slate-100",
    emptyIconColor: "text-slate-400",
    emptyTitle: "text-slate-700",
    emptyDesc: "text-slate-500",
    outlineBtn: "border-slate-300 text-slate-700 hover:bg-slate-50",
    checkboxBase:
      "border-slate-400 bg-white hover:border-indigo-400 data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-500 data-[state=indeterminate]:border-indigo-500 data-[state=indeterminate]:bg-indigo-500",
    dropdownContent: "border-slate-200 bg-white text-slate-700",
    dropdownItemHover: "focus:bg-slate-100",
    dropdownSeparator: "bg-slate-200",
    paginationBtn:
      "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    paginationCount: "text-slate-800",
    paginationText: "text-slate-500",
    sheetBg: "border-slate-200 bg-white text-slate-900",
    sheetSectionTitle: "text-slate-700",
    sheetBorder: "border-slate-200",
    remark: "border-slate-200 bg-slate-50 text-slate-600",
    detailBorder: "border-slate-100",
    detailLabel: "text-slate-500",
    detailValue: "text-slate-800",
    separator: "bg-slate-200",
    statusBadge: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    statusDot: "text-emerald-600",
    copyIcon: "text-slate-400",
    searchIcon: "text-slate-400",
    serialChip: "bg-slate-100 border border-slate-200 text-slate-700",
    serialChipHover: "hover:border-indigo-300 hover:bg-slate-50",
  },
};

const AVATAR_PALETTE = {
  dark: [
    { bg: "bg-teal-500/10", ring: "ring-teal-500/20", text: "text-teal-300" },
    { bg: "bg-rose-500/10", ring: "ring-rose-500/20", text: "text-rose-300" },
    {
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/20",
      text: "text-amber-300",
    },
    {
      bg: "bg-violet-500/10",
      ring: "ring-violet-500/20",
      text: "text-violet-300",
    },
    { bg: "bg-sky-500/10", ring: "ring-sky-500/20", text: "text-sky-300" },
  ],
  light: [
    { bg: "bg-teal-50", ring: "ring-teal-200", text: "text-teal-700" },
    { bg: "bg-rose-50", ring: "ring-rose-200", text: "text-rose-700" },
    { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700" },
    { bg: "bg-violet-50", ring: "ring-violet-200", text: "text-violet-700" },
    { bg: "bg-sky-50", ring: "ring-sky-200", text: "text-sky-700" },
  ],
};

// Natural, numeric-aware compare: "9" < "28" < "104" (not string order),
// and it still works fine on plain alphanumeric serials like
// "TTiMGPH26000K073". Missing/empty values always sort to the end,
// regardless of sort direction, instead of clumping at the top on desc.
function compareValues(a, b) {
  const aEmpty = a === undefined || a === null || a === "";
  const bEmpty = b === undefined || b === null || b === "";

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getAvatarStyle(name, mode) {
  const safeName = String(name ?? "");

  let hash = 0;

  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const palette = AVATAR_PALETTE[mode] || AVATAR_PALETTE.light;

  return palette[Math.abs(hash) % palette.length];
}

const formatDate = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
};

const formatDateTime = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
};

/**
 * A monospaced "chip" that copies itself on click — for IPs and serial
 * numbers a technician needs to paste into a terminal, ping, or a report.
 * Rendered as a distinct pill (not plain inline text) so serials are
 * instantly recognisable against normal table text, in both themes.
 */
function CopyableValue({ value, t }) {
  const [copied, setCopied] = useState(false);

  // No data for this cell — show a plain dash instead of an empty,
  // clickable-looking pill (this is what was making rows look "broken"
  // whenever a controller was missing a field).
  if (!value) {
    return <span className={`text-sm ${t.cellSecondary} opacity-50`}>—</span>;
  }

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API unavailable — fail silently, value is still visible/selectable.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${value}`}
      className="group inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/60"
    >
      <span
        className="text-sm font-semibold tracking-tight truncate"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {value}
      </span>
      {copied ? (
        <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Copy
          className={`h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${t.copyIcon}`}
        />
      )}
    </button>
  );
}

function StatChip({ icon: Icon, label, value, t }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2 ${t.statChip}`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.statIconBg}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="leading-tight">
        <p className={`text-sm font-semibold ${t.statValue}`}>{value}</p>
        <p className={`text-[11px] ${t.statLabel}`}>{label}</p>
      </div>
    </div>
  );
}

function SortableHeader({ label, active, direction, onClick, t }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1 rounded text-xs font-bold uppercase tracking-wide hover:text-indigo-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/60 ${active ? "text-indigo-500" : t.theadText
        }`}
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

/**
 * Thin wrapper around the shared <Checkbox/> that guarantees clicks always
 * register correctly inside table rows:
 *  - stops the click from bubbling to any parent row/label handlers
 *  - always hands callers a real boolean (never an event object or the
 *    Radix "indeterminate" sentinel), which is what was silently breaking
 *    `toggleSelect` before
 */
function RowCheckbox({ checked, onChange, label, t, className = "" }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Checkbox
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
        aria-label={label}
        className={`h-4 w-4 cursor-pointer transition-colors data-[state=checked]:text-white [&_svg]:!text-white [&_svg]:!stroke-white ${t.checkboxBase} ${className}`}
      />
    </span>
  );
}


const ControllersTable = memo(function ControllersTable({
  controllers,
  selectedIds,
  headerCheckboxState,
  toggleSelectAllLoaded,
  toggleSelect,
  toggleSort,
  sortKey,
  sortDir,
  openDetails,
  openEditForm,
  openHistory,
  generateSelectedAllPassedReports,
  generatingReports,
  loading,
  error,
  refreshControllers,
  clearFilters,
  hasFilters,
  t,
  mode,
  scrollContainerRef,
  loadMoreRef,
}) {
  return (
    <div
      className={`flex-1 min-h-0 overflow-hidden rounded-lg border ${t.tableWrap}`}
    >
      <div ref={scrollContainerRef} className="h-full overflow-auto">
        <table className="w-full min-w-[1250px] caption-bottom text-sm">
          <thead
            className={`sticky top-0 z-10 border-b backdrop-blur ${t.theadWrap}`}
          >
            <tr>
              <th className="w-[48px] px-4 py-3 text-center">
                <div className="flex justify-center">
                  <RowCheckbox
                    checked={headerCheckboxState}
                    onChange={toggleSelectAllLoaded}
                    label="Select all loaded controllers"
                    t={t}
                  />
                </div>
              </th>
              <th
                className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wide ${t.theadText}`}
              >
                Controller IP
              </th>
              <th
                className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wide ${t.theadText}`}
              >
                Assembly No.
              </th>
              <th className="px-4 py-3 text-center">
                <SortableHeader
                  label="CPU"
                  active={sortKey === "cpu"}
                  direction={sortDir}
                  onClick={() => toggleSort("cpu")}
                  t={t}
                />
              </th>
              <th className="px-4 py-3 text-center">
                <SortableHeader
                  label="Base"
                  active={sortKey === "base"}
                  direction={sortDir}
                  onClick={() => toggleSort("base")}
                  t={t}
                />
              </th>
              <th
                className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wide ${t.theadText}`}
              >
                PSU
              </th>
              <th className="px-4 py-3 text-center">
                <SortableHeader
                  label="Camera"
                  active={sortKey === "camera"}
                  direction={sortDir}
                  onClick={() => toggleSort("camera")}
                  t={t}
                />
              </th>
              <th className="px-4 py-3 text-center">
                <SortableHeader
                  label="Date Tested"
                  active={sortKey === "testedAt"}
                  direction={sortDir}
                  onClick={() => toggleSort("testedAt")}
                  t={t}
                />
              </th>
              <th
                className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wide ${t.theadText}`}
              >
                Tested By
              </th>
              <th className="w-[56px] px-3 py-3" />
            </tr>
          </thead>

          <tbody>
            {loading && controllers.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-[400px] text-center">
                  <div
                    className={`flex flex-col items-center justify-center ${t.subtitle}`}
                  >
                    <div className="w-8 h-8 mb-3 border-2 border-current rounded-full animate-spin border-t-transparent" />
                    <p className="text-sm font-medium">
                      Loading tested controllers...
                    </p>
                  </div>
                </td>
              </tr>
            ) : error && controllers.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-[400px] text-center">
                  <div className="flex flex-col items-center justify-center px-6">
                    <p className="font-medium text-red-500">
                      Failed to load controllers
                    </p>
                    <p className={`mt-1 max-w-md text-sm ${t.emptyDesc}`}>
                      {error}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`mt-4 ${t.outlineBtn}`}
                      onClick={refreshControllers}
                    >
                      Retry
                    </Button>
                  </div>
                </td>
              </tr>
            ) : controllers.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-[400px] text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div
                      className={`mb-3 rounded-full p-3 ${t.emptyIconBg}`}
                    >
                      <Search className={`h-5 w-5 ${t.emptyIconColor}`} />
                    </div>
                    <p className={`font-medium ${t.emptyTitle}`}>
                      No controllers found
                    </p>
                    <p className={`mt-1 text-sm ${t.emptyDesc}`}>
                      Try changing your search or filters.
                    </p>
                    {hasFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        className={`mt-4 ${t.outlineBtn}`}
                        onClick={clearFilters}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              controllers.map((controller) => {
                const isSelected = selectedIds.includes(controller._id);
                const avatarStyle = getAvatarStyle(
                  controller.testedBy,
                  mode,
                );

                return (
                  <tr
                    key={controller._id}
                    className={`border-b transition-colors last:border-0 ${t.rowBorder} ${isSelected ? t.rowSelected : t.rowHover
                      }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <RowCheckbox
                          checked={isSelected}
                          onChange={() => toggleSelect(controller._id)}
                          label={`Select controller ${controller.controllerIp}`}
                          t={t}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      {controller.controllerIp ? (
                        <button
                          onClick={() => openDetails(controller)}
                          className="text-sm font-semibold text-indigo-500 rounded hover:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/60"
                          style={{
                            fontFamily: "Arial, Helvetica, sans-serif",
                          }}
                        >
                          {controller.controllerIp}
                        </button>
                      ) : (
                        <button
                          onClick={() => openDetails(controller)}
                          className={`text-sm opacity-50 hover:opacity-80 ${t.cellSecondary}`}
                          title="No controller IP recorded — click to view details"
                        >
                          —
                        </button>
                      )}
                    </td>

                    <td
                      className={`px-4 py-3 text-center ${t.cellPrimary}`}
                    >
                      <CopyableValue
                        value={controller.unitSerialNo}
                        t={t}
                      />
                    </td>
                    <td
                      className={`px-4 py-3 text-center ${t.cellSecondary}`}
                    >
                      <CopyableValue value={controller.cpu} t={t} />
                    </td>
                    <td
                      className={`px-4 py-3 text-center ${t.cellSecondary}`}
                    >
                      <CopyableValue value={controller.base} t={t} />
                    </td>
                    <td
                      className={`px-4 py-3 text-center ${t.cellSecondary}`}
                    >
                      <CopyableValue value={controller.psu} t={t} />
                    </td>
                    <td
                      className={`px-4 py-3 text-center ${t.cellSecondary}`}
                    >
                      <CopyableValue value={controller.camera} t={t} />
                    </td>

                    <td
                      className={`whitespace-nowrap px-4 py-3 text-center text-sm font-medium ${t.cellDate}`}
                    >
                      {formatDate(controller.testedAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex cursor-pointer items-center justify-center gap-2.5
                     border-0 bg-transparent p-0
                     focus-visible:outline-none"
                              title={controller.status || "Not Tested"}
                            >
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center
                        rounded-full text-[10px] font-bold ring-1
                        ${avatarStyle.bg} ${avatarStyle.ring} ${avatarStyle.text}`}
                              >
                                {(controller.testedBy || "Imported")
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>

                              <span
                                className={`text-sm font-medium ${t.cellPrimary}`}
                              >
                                {controller.testedBy || "Imported"}
                              </span>
                            </button>
                          </TooltipTrigger>

                          <TooltipContent
                            side="top"
                            align="center"
                            sideOffset={8}
                            className="max-w-[320px] whitespace-normal break-words"
                          >
                            {controller.status || "Not Tested"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${t.mutedBtn}`}
                              aria-label={`Actions for ${controller.controllerIp}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent
                            align="end"
                            className={`w-56 ${t.dropdownContent}`}
                          >
                            <DropdownMenuItem
                              onClick={() => openDetails(controller)}
                              className={`cursor-pointer ${t.dropdownItemHover}`}
                            >
                              <Eye className="w-4 h-4 mr-2 text-indigo-500" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditForm(controller)}
                              className={`cursor-pointer ${t.dropdownItemHover}`}
                            >
                              <FileCheck2 className="mr-2 h-4 w-4 text-amber-500" />
                              Edit Record
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openHistory(controller)}
                              className={`cursor-pointer ${t.dropdownItemHover}`}
                            >
                              <History className="w-4 h-4 mr-2 text-violet-500" />
                              View Test History
                            </DropdownMenuItem>
                            <DropdownMenuSeparator
                              className={t.dropdownSeparator}
                            />
                            <DropdownMenuItem
                              disabled={generatingReports}
                              onClick={() =>
                                generateSelectedAllPassedReports([
                                  controller._id,
                                ])
                              }
                              className={`cursor-pointer ${t.dropdownItemHover}`}
                            >
                              <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-500" />
                              Generate All-Passed Report
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Sentinel: when this enters the table's scroll viewport,
                the next backend page is fetched automatically. */}
        <div
          ref={loadMoreRef}
          aria-hidden="true"
          className="w-full h-1"
        />
      </div>
    </div>
  )
});

export default function TestedControllers() {
  const [mode, setMode] = useState("light"); // "dark" | "light"
  const t = THEME[mode];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [testerFilter, setTesterFilter] = useState("all");

  const [sortKey, setSortKey] = useState("testedAt");
  const [sortDir, setSortDir] = useState("desc");

  const PAGE_SIZE = 20;

  const [controllers, setControllers] = useState([]);
  const visibleControllers = controllers;

  const [totalControllers, setTotalControllers] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [loading, setLoading] = useState(false); // Initial load only
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState("");

  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedController, setSelectedController] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [generatingReports, setGeneratingReports] = useState(false);

  const [searchField, setSearchField] = useState("all");
  const [testerOptions, setTesterOptions] = useState([]);

  const [stableStats, setStableStats] = useState({
    total: 0,
    uniqueTesters: 0,
    latestDate: "—",
  });

  const emptyForm = {
    controllerIp: "",
    unitSerialNo: "",
    cpu: "",
    base: "",
    psu: "",
    camera: "",
    testedBy: "",
    status: "Tested",
    remark: "",
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [savingRecord, setSavingRecord] = useState(false);
  const [formError, setFormError] = useState("");

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ ...emptyForm });
    setFormError("");
    setFormOpen(true);
  };

  const openEditForm = (controller) => {
    setEditingId(controller._id);
    setFormData({
      controllerIp: controller.controllerIp ?? "",
      unitSerialNo: controller.unitSerialNo ?? "",
      cpu: controller.cpu ?? "",
      base: controller.base ?? "",
      psu: controller.psu ?? "",
      camera: controller.camera ?? "",
      testedBy: controller.testedBy ?? "",
      status: controller.status ?? "Tested",
      remark: controller.remark ?? "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveManualRecord = async (e) => {
    e.preventDefault();

    if (savingRecord) return;

    setSavingRecord(true);
    setFormError("");

    try {
      const isEditing = Boolean(editingId);
      const url = isEditing
        ? `${API_URL}/api/tested-controllers/${editingId}`
        : `${API_URL}/api/tested-controllers`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });


      const data = await response.json().catch(() => ({}));

      console.log("[MANUAL SAVE] Sending record:", {
        isEditing,
        url,
        formData,
      });

      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || "Failed to save record");
      }

      // Update the visible row immediately after a successful edit.
      // The API may return database field names (cameraSr, deviceIP, etc.),
      // while the table uses the normalized UI names (camera, controllerIp).
      if (isEditing) {
        const savedRecord = data.data || {};

        const updatedFields = {
          ...formData,
          ...savedRecord,

          controllerIp:
            savedRecord.controllerIp ??
            savedRecord.deviceIP ??
            formData.controllerIp,

          unitSerialNo:
            savedRecord.unitSerialNo ??
            savedRecord.assemblySrNo ??
            formData.unitSerialNo,

          cpu:
            savedRecord.cpu ??
            savedRecord.cpuSr ??
            formData.cpu,

          base:
            savedRecord.base ??
            savedRecord.basePcbSr ??
            formData.base,

          camera:
            savedRecord.camera ??
            savedRecord.cameraSr ??
            formData.camera,

          psu:
            savedRecord.psu ??
            savedRecord.psuSrNo ??
            savedRecord.psuSr ??
            formData.psu,
        };

        setControllers((current) =>
          current.map((item) =>
            String(item._id) === String(editingId)
              ? { ...item, ...updatedFields, _id: item._id }
              : item,
          ),
        );

        setSelectedController((current) =>
          current && String(current._id) === String(editingId)
            ? { ...current, ...updatedFields, _id: current._id }
            : current,
        );
      }

      setFormOpen(false);
      setEditingId(null);

      // Re-fetch in the background to keep pagination and server-derived
      // fields in sync; the row is already updated locally above.
      refreshControllers();

      console.log("[MANUAL SAVE] Local record updated; refresh requested");
    } catch (err) {
      console.error("Manual record save failed:", err);
      setFormError(err.message || "Failed to save record");
    } finally {
      setSavingRecord(false);
    }
  };

  const generateSelectedAllPassedReports = async (ids = selectedIds) => {
    if (!ids.length || generatingReports) return;

    setGeneratingReports(true);

    try {
      const response = await fetch(
        `${API_URL}/api/tested-controllers/generate-all-passed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            controllerIds: ids,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate reports");
      }

      alert(
        data.message ||
        `All-Passed reports generated for ${ids.length} controller(s).`,
      );
    } catch (err) {
      console.error("All-Passed report generation failed:", err);
      alert(err.message || "Failed to generate All-Passed reports.");
    } finally {
      setGeneratingReports(false);
    }
  };

  const scrollContainerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const requestIdRef = useRef(0);

  const fetchControllers = async (
    pageToLoad = 1,
    replace = pageToLoad === 1,
  ) => {
    if (pageToLoad > 1 && (loadingMoreRef.current || !hasMore)) {
      return;
    }

    // Only replacement requests (initial load / refresh / filter changes)
    // establish a new request generation. Loading another page must not
    // invalidate the active refresh and leave its spinner stuck.
    const requestId = replace
      ? ++requestIdRef.current
      : requestIdRef.current;

    try {
      if (replace) {
        setLoading(!hasLoadedOnceRef.current);
        setRefreshing(hasLoadedOnceRef.current);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      setError("");

      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(PAGE_SIZE),
        sortBy: sortKey,
        sortOrder: sortDir,
      });

      if (search.trim()) {
        params.set("search", search.trim());
        params.set("searchField", searchField);
      }

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      if (testerFilter !== "all") {
        params.set("testedBy", testerFilter);
      }

      const response = await fetch(
        `${API_URL}/api/tested-controllers?${params.toString()}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load tested controllers");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }


      hasLoadedOnceRef.current = true;

      const newRecords = Array.isArray(data.data)
        ? data.data.map((item) => ({
          ...item,

          controllerIp:
            item.controllerIp ?? item.deviceIP ?? "",

          unitSerialNo:
            item.unitSerialNo ?? item.assemblySrNo ?? "",

          cpu:
            item.cpu ?? item.cpuSr ?? "",

          base:
            item.base ?? item.basePcbSr ?? "",

          camera:
            item.camera ?? item.cameraSr ?? "",

          psu:
            item.psu ?? item.psuSrNo ?? item.psuSr ?? "",

          testedAt:
            item.testedAt ?? item.dateTested ?? null,

          testedBy:
            item.testedBy ?? "Imported",
        }))
        : [];

      console.log("[MAP] Mapped record count:", newRecords.length);

      console.table(
        newRecords.map((item) => ({
          _id: item._id,
          controllerIp: item.controllerIp,
          unitSerialNo: item.unitSerialNo,
          cpu: item.cpu,
          base: item.base,
          camera: item.camera,
          psu: item.psu,
          testedBy: item.testedBy,
          status: item.status,
        }))
      );

      const paginationData = data.pagination || {};
      const total = Number(paginationData.total || 0);
      const totalPages = Number(paginationData.totalPages || 1);

      setTotalControllers(total);

      setControllers((current) => {
        if (replace) {
          return newRecords;
        }

        const existingIds = new Set(current.map((item) => String(item._id)));

        return [
          ...current,
          ...newRecords.filter((item) => !existingIds.has(String(item._id))),
        ];
      });

      setHasMore(pageToLoad < totalPages && newRecords.length > 0);

      setNextPage(pageToLoad + 1);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        console.error("Failed to load tested controllers:", err);
        setError(err.message || "Failed to load tested controllers");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        if (replace) {
          setLoading(false);
          setRefreshing(false);
        } else {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    }
  };

  // Initial load + reload whenever search/filter changes.
  useEffect(() => {
    requestIdRef.current += 1;
    loadingMoreRef.current = false;

    setLoadingMore(false);
    // setControllers([]);
    // setTotalControllers(0);
    setNextPage(1);
    setHasMore(true);
    setSelectedIds([]);

    const timer = setTimeout(() => {
      fetchControllers(1, true);
    }, 350);

    return () => clearTimeout(timer);
  }, [search, searchField, statusFilter, testerFilter, sortKey, sortDir]);

  // Infinite scroll uses an IntersectionObserver instead of relying on the
  // scroll event. This is more reliable when the table is inside a nested
  // overflow container.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = loadMoreRef.current;

    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (
          entry.isIntersecting &&
          !loading &&
          !loadingMoreRef.current &&
          hasMore
        ) {
          fetchControllers(nextPage, false);
        }
      },
      {
        root: container,
        rootMargin: "300px 0px 300px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    loading,
    hasMore,
    nextPage,
    search,
    searchField,
    statusFilter,
    testerFilter,
    sortKey,
    sortDir,
  ]);

  const navigate = useNavigate();

  const testers = useMemo(() => {
    const currentTesters = controllers
      .map((item) => item.testedBy)
      .filter(Boolean);

    return [...new Set([...testerOptions, ...currentTesters])].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [controllers, testerOptions]);

  const stats = {
    total: totalControllers,
    uniqueTesters: testers.length,
    latestDate:
      controllers.length > 0
        ? formatDate(
          controllers.reduce((latest, controller) => {
            if (!latest?.testedAt) return controller;
            if (!controller?.testedAt) return latest;

            return new Date(controller.testedAt) >
              new Date(latest.testedAt)
              ? controller
              : latest;
          }, controllers[0]).testedAt
        )
        : "—",
  };

  // CPU / Base / Camera / Date Tested headers only *tracked* sortKey and
  // sortDir before — nothing ever consumed them, so clicking them did
  // nothing. This actually orders the current page's rows.
  // Backend already returns the records in the correct global order.
  // Do NOT sort only the currently loaded records here.

  console.log("[RENDER] Controllers in state:", controllers.length);
  console.log("[RENDER] Visible controllers:", visibleControllers.length);
  console.log("[RENDER] Current filters:", {
    search,
    statusFilter,
    testerFilter,
  });

  const allLoadedSelected =
    visibleControllers.length > 0 &&
    visibleControllers.every((controller) =>
      selectedIds.includes(controller._id),
    );

  const someLoadedSelected = visibleControllers.some((controller) =>
    selectedIds.includes(controller._id),
  );

  const headerCheckboxState = allLoadedSelected
    ? true
    : someLoadedSelected
      ? "indeterminate"
      : false;

  const toggleSelectAllLoaded = () => {
    if (allLoadedSelected) {
      setSelectedIds((current) =>
        current.filter(
          (id) =>
            !visibleControllers.some((controller) => controller._id === id),
        ),
      );

      return;
    }

    setSelectedIds((current) => [
      ...new Set([
        ...current,
        ...visibleControllers.map((controller) => controller._id),
      ]),
    ]);
  };

  const toggleSelect = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openDetails = async (controller) => {
    setSelectedController(controller);
    setDetailsOpen(true);

    try {
      const response = await fetch(
        `${API_URL}/api/tested-controllers/${controller._id}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load controller details");
      }

      const item = data.data || {};

      setSelectedController({
        ...item,

        controllerIp:
          item.controllerIp ?? item.deviceIP ?? "",

        unitSerialNo:
          item.unitSerialNo ?? item.unitSerialNo ?? item.assemblySrNo ?? "",

        cpu:
          item.cpu ?? item.cpuSr ?? "",

        base:
          item.base ?? item.basePcbSr ?? "",

        psu:
          item.psu ?? item.psuSrNo ?? item.psuSr ?? "",

        camera:
          item.camera ?? item.cameraSr ?? "",

        testedAt:
          item.testedAt ?? item.dateTested ?? null,

        testedBy:
          item.testedBy ?? "Imported",
      });
    } catch (err) {
      console.error("Failed to load controller details:", err);
    }
  };

  const openHistory = async (controller) => {
    try {
      setHistoryOpen(true);
      setHistoryLoading(true);
      setHistory([]);

      const response = await fetch(
        `${API_URL}/api/tested-controllers/${controller._id}/history`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load test history");
      }

      setHistory(data.data || []);
    } catch (err) {
      console.error("Failed to load test history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setSearchField("all");
    setStatusFilter("all");
    setTesterFilter("all");
  };

  const refreshControllers = () => {
    requestIdRef.current += 1;
    loadingMoreRef.current = false;
    // setControllers([]);
    // setTotalControllers(0);
    setNextPage(1);
    setHasMore(true);
    setSelectedIds([]);
    fetchControllers(1, true);
  };

  const hasFilters =
    search.trim() !== "" ||
    searchField !== "all" ||
    statusFilter !== "all" ||
    testerFilter !== "all";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`flex h-screen min-h-0 flex-col overflow-hidden font-sans transition-colors ${t.page}`}
      >
        {/* Header */}
        <div
          className={`flex flex-col gap-4 border-b px-6 py-4 lg:flex-row lg:items-center lg:justify-between ${t.border}`}
        >
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className={`mt-0.5 h-8 w-8 shrink-0 ${t.iconBtn}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                  <FileCheck2 className="w-4 h-4 text-indigo-500" />
                </div>
                <h1
                  className={`text-lg font-semibold tracking-tight ${t.heading}`}
                >
                  Tested Controllers
                </h1>
              </div>
              <p className={`mt-1 text-xs ${t.subtitle}`}>
                View and manage controller registry records.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatChip
              icon={FileCheck2}
              label="Total records"
              value={stats.total}
              t={t}
            />
            <StatChip
              icon={Users}
              label="Testers"
              value={stats.uniqueTesters}
              t={t}
            />
            <StatChip
              icon={History}
              label="Most recent"
              value={stats.latestDate}
              t={t}
            />

            <Button
              variant="outline"
              size="icon"
              onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
              aria-label={
                mode === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                mode === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              className={`h-9 w-9 ${t.themeToggle}`}
            >
              {mode === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>

            <Button
              onClick={openAddForm}
              className="h-9 gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <span className="text-lg leading-none">+</span>
              Add Record
            </Button>

            <Button
              disabled={selectedIds.length === 0 || generatingReports}
              onClick={() => generateSelectedAllPassedReports()}
              className="gap-2 text-white bg-indigo-500 h-9 hover:bg-indigo-400 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {generatingReports
                ? "Generating..."
                : `Generate All-Passed Reports${selectedIds.length ? ` (${selectedIds.length})` : ""
                }`}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 min-h-0 px-6 py-5 overflow-hidden">
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-md">
              <Search
                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.searchIcon}`}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search IP, assembly, CPU, base, PSU or camera..."
                className={`h-10 pl-9 text-sm focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500/50 ${t.input}`}
              />
            </div>

            <Select
              value={searchField}
              onValueChange={setSearchField}
            >
              <SelectTrigger className={`w-[150px] h-10 ${t.selectTrigger}`}>
                <SelectValue placeholder="Search field" />
              </SelectTrigger>

              <SelectContent className={t.selectContent}>
                <SelectItem value="all">All fields</SelectItem>
                <SelectItem value="cpu">CPU only</SelectItem>
                <SelectItem value="base">Base only</SelectItem>
                <SelectItem value="camera">Camera only</SelectItem>
                <SelectItem value="psu">PSU only</SelectItem>
                <SelectItem value="assemblyNo">Assembly only</SelectItem>
                <SelectItem value="controllerIp">IP only</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={`w-[140px] ${t.selectTrigger}`}>
                  <SlidersHorizontal className="w-4 h-4 mr-2 opacity-60" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="tested">Tested</SelectItem>
                  <SelectItem value="not tested">Not Tested</SelectItem>
                </SelectContent>
              </Select>

              <Select value={testerFilter} onValueChange={setTesterFilter}>
                <SelectTrigger className={`w-[150px] ${t.selectTrigger}`}>
                  <SelectValue placeholder="Tester" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="all">All Testers</SelectItem>
                  {testers.map((tester) => (
                    <SelectItem key={tester} value={tester}>
                      {tester}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className={`gap-1.5 ${t.mutedBtn}`}
                >
                  <X className="w-4 h-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {refreshing && (
            <div
              className={`flex items-center gap-2 text-xs ${t.subtitle}`}
              role="status"
              aria-live="polite"
            >
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Updating records...
            </div>
          )}

          {/* Selection toolbar */}
          {selectedIds.length > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span
                  className={`text-sm font-medium ${mode === "dark" ? "text-amber-200" : "text-amber-800"
                    }`}
                >
                  {selectedIds.length}{" "}
                  {selectedIds.length === 1 ? "controller" : "controllers"}{" "}
                  selected
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={generatingReports}
                  onClick={() => generateSelectedAllPassedReports()}
                  className="h-8 gap-1.5 border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-500 hover:bg-indigo-500/20"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {generatingReports ? "Generating..." : "Generate All-Passed"}
                </Button>{" "}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className={`h-8 text-xs ${t.mutedBtn}`}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <ControllersTable
            controllers={controllers}
            selectedIds={selectedIds}
            headerCheckboxState={headerCheckboxState}
            toggleSelectAllLoaded={toggleSelectAllLoaded}
            toggleSelect={toggleSelect}
            toggleSort={toggleSort}
            sortKey={sortKey}
            sortDir={sortDir}
            openDetails={openDetails}
            openEditForm={openEditForm}
            openHistory={openHistory}
            generateSelectedAllPassedReports={generateSelectedAllPassedReports}
            generatingReports={generatingReports}
            loading={loading}
            error={error}
            refreshControllers={refreshControllers}
            clearFilters={clearFilters}
            hasFilters={hasFilters}
            t={t}
            mode={mode}
            scrollContainerRef={scrollContainerRef}
            loadMoreRef={loadMoreRef}
          />


          {/* Infinite-scroll status */}
          <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
            {loadingMore ? (
              <div className={`flex items-center gap-2 text-xs ${t.subtitle}`}>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                Loading more controllers...
              </div>
            ) : !hasMore && controllers.length > 0 ? (
              <span className={`text-xs ${t.subtitle}`}>
                All {totalControllers} controllers loaded
              </span>
            ) : null}
          </div>

          {/* Details Sheet */}
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
            <SheetContent
              className={`w-full overflow-y-auto border-l sm:max-w-lg ${t.sheetBg}`}
            >
              {selectedController && (
                <>
                  <SheetHeader>
                    <div className="flex items-center gap-3">
                      <SheetTitle className={t.heading}>
                        Controller Details
                      </SheetTitle>
                      <Badge
                        className={`${t.statusBadge} hover:bg-transparent`}
                      >
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                        {selectedController.status}
                      </Badge>
                    </div>
                    <SheetDescription className={t.subtitle}>
                      Complete information for this tested controller.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    <div>
                      <h3
                        className={`mb-3 text-sm font-semibold ${t.sheetSectionTitle}`}
                      >
                        Controller Information
                      </h3>
                      <div className={`rounded-lg border ${t.sheetBorder}`}>
                        <DetailRow
                          label="Controller IP"
                          value={selectedController.controllerIp}
                          t={t}
                        />
                        <DetailRow
                          label="Assembly No."
                          value={selectedController.unitSerialNo}
                          t={t}
                        />
                      </div>
                    </div>

                    <Separator className={t.separator} />

                    <div>
                      <h3
                        className={`mb-3 text-sm font-semibold ${t.sheetSectionTitle}`}
                      >
                        Hardware Details
                      </h3>
                      <div className={`rounded-lg border ${t.sheetBorder}`}>
                        <DetailRow
                          label="CPU Serial No."
                          value={selectedController.cpu}
                          t={t}
                        />
                        <DetailRow
                          label="Base PCB Serial No."
                          value={selectedController.base}
                          t={t}
                        />
                        <DetailRow
                          label="PSU Serial No."
                          value={selectedController.psu}
                          t={t}
                        />
                        <DetailRow
                          label="Camera Serial No."
                          value={selectedController.camera}
                          t={t}
                        />
                      </div>
                    </div>

                    <Separator className={t.separator} />

                    <div>
                      <h3
                        className={`mb-3 text-sm font-semibold ${t.sheetSectionTitle}`}
                      >
                        Testing Information
                      </h3>
                      <div className={`rounded-lg border ${t.sheetBorder}`}>
                        <DetailRow
                          label="Date Tested"
                          value={formatDateTime(selectedController.testedAt)}
                          t={t}
                        />
                        <DetailRow
                          label="Tested By"
                          value={selectedController.testedBy}
                          t={t}
                        />
                      </div>
                    </div>

                    {selectedController.remark && (
                      <>
                        <Separator className={t.separator} />
                        <div>
                          <h3
                            className={`mb-3 text-sm font-semibold ${t.sheetSectionTitle}`}
                          >
                            Remark
                          </h3>
                          <div
                            className={`rounded-lg border p-3 text-sm ${t.remark}`}
                          >
                            {selectedController.remark}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className={`flex-1 ${t.outlineBtn}`}
                        onClick={() => openHistory(selectedController)}
                      >
                        <History className="w-4 h-4 mr-2" />
                        View Test History
                      </Button>
                      <Button className="flex-1 text-white bg-indigo-500 hover:bg-indigo-400">
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Generate Report
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>

          {/* Test History Sheet */}
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetContent
              className={`w-full overflow-y-auto border-l sm:max-w-lg ${t.sheetBg}`}
            >
              <SheetHeader>
                <SheetTitle className={t.heading}>Test History</SheetTitle>
                <SheetDescription className={t.subtitle}>
                  Previous testing records for this controller.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6">
                {historyLoading ? (
                  <div
                    className={`flex flex-col items-center justify-center py-12 ${t.subtitle}`}
                  >
                    <div className="mb-3 border-2 border-current rounded-full h-7 w-7 animate-spin border-t-transparent" />
                    <p className="text-sm font-medium">
                      Loading test history...
                    </p>
                  </div>
                ) : history.length === 0 ? (
                  <div className={`py-12 text-center text-sm ${t.subtitle}`}>
                    No test history found.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((record, index) => (
                      <div
                        key={record._id}
                        className={`rounded-lg border p-4 ${t.sheetBorder}`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0
                                ? "bg-indigo-500/10 text-indigo-500"
                                : "bg-slate-500/10 text-slate-500"
                                }`}
                            >
                              {index + 1}
                            </span>
                            <span
                              className={`text-sm font-semibold ${t.sheetSectionTitle}`}
                            >
                              {index === 0
                                ? "Latest Test"
                                : `Previous Test ${index}`}
                            </span>
                          </div>

                          <Badge
                            className={`${t.statusBadge} hover:bg-transparent`}
                          >
                            {record.status || "Tested"}
                          </Badge>
                        </div>

                        <div className={`rounded-lg border ${t.sheetBorder}`}>
                          <DetailRow
                            label="Controller IP"
                            value={record.controllerIp}
                            t={t}
                          />
                          <DetailRow
                            label="Assembly No."
                            value={record.unitSerialNo}
                            t={t}
                          />
                          <DetailRow label="CPU" value={record.cpu} t={t} />
                          <DetailRow label="Base" value={record.base} t={t} />
                          <DetailRow label="PSU" value={record.psu} t={t} />
                          <DetailRow
                            label="Camera"
                            value={record.camera}
                            t={t}
                          />
                          <DetailRow
                            label="Tested By"
                            value={record.testedBy}
                            t={t}
                          />
                          <DetailRow
                            label="Date Tested"
                            value={formatDateTime(record.testedAt)}
                            t={t}
                          />
                        </div>

                        {record.remark && (
                          <div
                            className={`mt-3 rounded-md border p-3 text-xs ${t.remark}`}
                          >
                            {record.remark}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* MANUAL FORM SHEET */}
          <Sheet open={formOpen} onOpenChange={setFormOpen}>
            <SheetContent
              className={`w-full overflow-y-auto border-l sm:max-w-lg ${t.sheetBg}`}
            >
              <SheetHeader>
                <SheetTitle className={t.heading}>
                  {editingId ? "Edit Controller Record" : "Add Controller Record"}
                </SheetTitle>
                <SheetDescription className={t.subtitle}>
                  {editingId
                    ? "Update the saved controller information."
                    : "Manually add a controller to the tested controllers registry."}
                </SheetDescription>
              </SheetHeader>

              <form onSubmit={saveManualRecord} className="mt-6 space-y-4">
                {[
                  { key: "controllerIp", label: "Controller IP", required: true },
                  { key: "unitSerialNo", label: "Assembly No.", required: true },
                  { key: "cpu", label: "CPU Serial No.", required: true },
                  { key: "base", label: "Base PCB Serial No.", required: true },
                  { key: "psu", label: "PSU Serial No.", required: true },
                  { key: "camera", label: "Camera Serial No.", required: true },
                  { key: "testedBy", label: "Tested By", required: true },
                ].map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label
                      htmlFor={`manual-${field.key}`}
                      className={`text-sm font-medium ${t.detailLabel}`}
                    >
                      {field.label}
                    </label>
                    <Input
                      id={`manual-${field.key}`}
                      value={formData[field.key]}
                      onChange={(e) =>
                        handleFormChange(field.key, e.target.value)
                      }
                      required={field.required}
                      className={t.input}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label className={`text-sm font-medium ${t.detailLabel}`}>
                    Status
                  </label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleFormChange("status", value)}
                  >
                    <SelectTrigger className={t.selectTrigger}>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className={t.selectContent}>
                      <SelectItem value="Tested">Tested</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="manual-remark"
                    className={`text-sm font-medium ${t.detailLabel}`}
                  >
                    Remark
                  </label>
                  <textarea
                    id="manual-remark"
                    value={formData.remark}
                    onChange={(e) => handleFormChange("remark", e.target.value)}
                    rows={3}
                    className={`w-full rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${t.input}`}
                    placeholder="Optional notes"
                  />
                </div>

                {formError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                    {formError}
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={`flex-1 ${t.outlineBtn}`}
                    onClick={() => setFormOpen(false)}
                    disabled={savingRecord}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    className="flex-1 bg-indigo-500 text-white hover:bg-indigo-400"
                    disabled={savingRecord}
                  >
                    {savingRecord
                      ? "Saving..."
                      : editingId
                        ? "Save Changes"
                        : "Add Record"}
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </TooltipProvider>
  );
}

function DetailRow({ label, value, t }) {
  return (
    <div
      className={`flex items-center justify-between gap-6 border-b px-4 py-3 last:border-0 ${t.detailBorder}`}
    >
      <span className={`text-xs ${t.detailLabel}`}>{label}</span>
      <span
        className={`max-w-[65%] break-all text-right text-xs font-medium ${t.detailValue}`}
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}
