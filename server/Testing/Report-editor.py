
from pathlib import Path
import os
import tempfile
import win32com.client as win32
import re


# =========================================================
# CONFIGURATION
# =========================================================

REFERENCE_REPORT_NO = "iMoni-SRMS-0401"

# Excel constants
XL_UP = -4162
XL_OPENXML_WORKBOOK = 51
# XL_CALCULATION_MANUAL = -4135

# Reference layout from your screenshot
FIRST_TEST_ROW = 10
LAST_TEST_ROW = 25
TOTAL_TESTS = 16


# =========================================================
# HELPERS
# =========================================================

def get_report_no(ws):
    return str(ws.Range("B2").Value or "").strip()


def read_header(ws):
    """Capture all report-specific header data."""

    return {
        "B2": ws.Range("B2").Value,  # Report No.
        "B3": ws.Range("B3").Value,  # Assembly Sr. No.
        "B4": ws.Range("B4").Value,  # DateTime
        "B5": ws.Range("B5").Value,  # TestLevel
        "B6": ws.Range("B6").Value,  # DeviceIP
        "C7": ws.Range("C7").Value,  # CPU
        "D7": ws.Range("D7").Value,  # Base PCB
        "E7": ws.Range("E7").Value,  # Camera
        "F7": ws.Range("F7").Value,  # PSU
    }


def normalize_assembly_no(value):
    """Correct assembly serial number letter casing."""

    if not value:
        return value

    value = str(value).strip()

    pattern = (
        r"TTiM(GP|BL)(E|H)26000K(\d+)"
    )

    match = re.fullmatch(pattern, value, re.IGNORECASE)

    if not match:
        print(f"WARNING: Invalid assembly number: {value}")
        return value

    group, variant, number = match.groups()

    return f"TTiM{group.upper()}{variant.upper()}26000K{number}"


def read_tests(ws):
    """
    Capture test results by TestName.

    Existing target results will be retained.
    """

    tests = {}

    for row in range(FIRST_TEST_ROW, LAST_TEST_ROW + 1):

        name = str(ws.Cells(row, 2).Value or "").strip()

        if not name:
            continue

        tests[name] = {
            "status": ws.Cells(row, 3).Value,
            "checks": ws.Cells(row, 4).Value,
            "reason": ws.Cells(row, 5).Value,
            "remarks": ws.Cells(row, 6).Value,
        }

    return tests


def write_header(ws, header):
    """Restore target-specific header values."""

    for cell, value in header.items():
        ws.Range(cell).Value = value

    # Standardized total test count
    ws.Range("B7").Value = TOTAL_TESTS


def write_tests(ws, master_tests, target_tests):
    """
    Write all 16 master test rows.

    Existing target test results take precedence.
    Missing target tests use master results.
    """

    for row in range(FIRST_TEST_ROW, LAST_TEST_ROW + 1):

        name = str(ws.Cells(row, 2).Value or "").strip()

        if not name:
            continue

        # Start with master results.
        result = master_tests[name].copy()

        # Preserve target's own results if available.
        if name in target_tests:
            result = target_tests[name]

        ws.Cells(row, 1).Value = row - FIRST_TEST_ROW + 1
        ws.Cells(row, 3).Value = result["status"]
        ws.Cells(row, 4).Value = result["checks"]
        ws.Cells(row, 5).Value = result["reason"]
        ws.Cells(row, 6).Value = result["remarks"]


# =========================================================
# 1. GET FOLDER
# =========================================================

folder = Path(
    input("Enter folder path containing Excel reports: ")
    .strip()
    .strip('"')
)

if not folder.is_dir():
    raise NotADirectoryError(folder)


# =========================================================
# 2. SCAN EXCEL FILES
# =========================================================

files = [
    file
    for file in folder.rglob("*.xlsx")
    if not file.name.startswith("~$")
]

if not files:
    raise RuntimeError("No Excel files found.")


# =========================================================
# 3. START EXCEL
# =========================================================

excel = win32.DispatchEx("Excel.Application")

excel.Visible = False
excel.DisplayAlerts = False
excel.AskToUpdateLinks = False
excel.EnableEvents = False
excel.ScreenUpdating = False
# excel.Calculation = XL_CALCULATION_MANUAL

master_wb = None
master_ws = None
master_file = None


try:

    # =====================================================
    # 4. FIND MASTER BY WORKBOOK CONTENT
    # =====================================================

    for file in files:

        wb = None

        try:
            wb = excel.Workbooks.Open(
                str(file.resolve()),
                UpdateLinks=0,
                ReadOnly=True,
                IgnoreReadOnlyRecommended=True,
                AddToMru=False
            )

            for ws in wb.Worksheets:

                if get_report_no(ws) == REFERENCE_REPORT_NO:
                    master_file = file
                    master_wb = wb
                    master_ws = ws
                    break

            if master_file:
                break

            wb.Close(SaveChanges=False)

        except Exception as exc:
            print(f"Cannot inspect {file.name}: {exc}")

            if wb is not None:
                try:
                    wb.Close(SaveChanges=False)
                except Exception:
                    pass

    if master_file is None:
        raise RuntimeError(
            f"Master report {REFERENCE_REPORT_NO} not found."
        )

    print(f"\nMaster: {master_file.name}")

    # =====================================================
    # 5. EXTRACT MASTER TEST RESULTS ONCE
    # =====================================================

    master_tests = read_tests(master_ws)

    if len(master_tests) != TOTAL_TESTS:
        raise RuntimeError(
            f"Master contains {len(master_tests)} tests, "
            f"expected {TOTAL_TESTS}. Stopping."
        )

    print(f"Master tests extracted: {len(master_tests)}")

    # =====================================================
    # 6. PROCESS OTHER REPORTS
    # =====================================================

    updated = 0
    skipped = 0
    failed = 0

    for file in files:

        if file.resolve() == master_file.resolve():
            continue

        target_wb = None
        output_wb = None
        temp_path = None

        try:

            print(f"\nProcessing: {file.name}")

            # ---------------------------------------------
            # Read target-specific data and test results
            # ---------------------------------------------

            target_wb = excel.Workbooks.Open(
                str(file.resolve()),
                UpdateLinks=0,
                ReadOnly=True,
                IgnoreReadOnlyRecommended=True,
                AddToMru=False
            )

            target_ws = target_wb.Worksheets(1)

            report_no = get_report_no(target_ws)

            if not report_no.startswith("iMoni-SRMS-"):
                print("Skipped: not an SRMS report.")
                target_wb.Close(SaveChanges=False)
                skipped += 1
                continue

            target_header = read_header(target_ws)

            target_header["B3"] = normalize_assembly_no(
                target_header["B3"]
            )

            target_tests = read_tests(target_ws)

            target_wb.Close(SaveChanges=False)
            target_wb = None

            # ---------------------------------------------
            # Create a native Excel copy of the master sheet
            # ---------------------------------------------

            master_ws.Copy()

            # Copy() creates a new workbook.
            output_wb = excel.ActiveWorkbook
            output_ws = output_wb.Worksheets(1)

            # ---------------------------------------------
            # Restore target-specific header information
            # ---------------------------------------------

            write_header(output_ws, target_header)

            # ---------------------------------------------
            # Restore all 16 test results
            # ---------------------------------------------

            write_tests(
                output_ws,
                master_tests,
                target_tests
            )

            # ---------------------------------------------
            # Save to a temporary XLSX file
            # ---------------------------------------------

            with tempfile.NamedTemporaryFile(
                suffix=".xlsx",
                dir=str(file.parent),
                delete=False
            ) as temp:
                temp_path = Path(temp.name)

            output_wb.SaveAs(
                str(temp_path),
                FileFormat=XL_OPENXML_WORKBOOK
            )

            output_wb.Close(SaveChanges=False)
            output_wb = None

            # Replace original file, preserving its filename.
            os.replace(temp_path, file)
            temp_path = None

            print(f"Updated: {file.name}")
            updated += 1

        except Exception as exc:

            print(f"FAILED: {file.name}")
            print(f"Reason: {exc}")
            failed += 1

        finally:

            if target_wb is not None:
                try:
                    target_wb.Close(SaveChanges=False)
                except Exception:
                    pass

            if output_wb is not None:
                try:
                    output_wb.Close(SaveChanges=False)
                except Exception:
                    pass

            if temp_path is not None and temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass

    print("\n========== COMPLETE ==========")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    print(f"Failed:  {failed}")

finally:

    if master_wb is not None:
        try:
            master_wb.Close(SaveChanges=False)
        except Exception:
            pass

    excel.Quit()
